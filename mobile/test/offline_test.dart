import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/models/task.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/order_items_provider.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/tasks_repository.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/overlay.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/shared/comments_section.dart';

class _Queue extends ActionQueue {
  final List<PendingAction> initial;
  _Queue([this.initial = const []]);

  @override
  List<PendingAction> build() => initial;

  @override
  void enqueue(PendingAction action) => state = [...state, action];
}

/// Firestore'siz repozitoriy: mahsulotlar/hujjat/izohlar oqimlari test boshqaradi.
class _FakeRepo extends OrdersRepository {
  int itemListeners = 0;
  ({List<OrderItem> items, bool fromCache}) items = (items: const [], fromCache: true);
  Order? doc;
  ({List<Map<String, dynamic>> comments, bool fromCache}) comments = (comments: const [], fromCache: true);

  _FakeRepo(super.ref);

  @override
  Stream<({List<OrderItem> items, bool fromCache})> watchItems(String orderId) {
    itemListeners++;
    return Stream.value(items);
  }

  @override
  Stream<Order?> watchOrder(String orderId) => Stream.value(doc);

  @override
  Stream<({List<Map<String, dynamic>> comments, bool fromCache})> watchComments(String orderId) => Stream.value(comments);
}

OrderItem item(String id, int n, {String status = 'washing', num price = 100000}) =>
    OrderItem(id: id, itemNumber: n, name: 'Gilam $n', area: 12, price: price, qcStatus: 'pending', status: status);

Order order({List<OrderItem>? mirror, String id = 'o1'}) => Order(
      id: id,
      orderNumber: 1245,
      customerName: 'Aziz',
      phone: '+998901234567',
      location: 'Yunusobod',
      serviceType: 'pickup',
      status: 'brought_in',
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      itemsMirror: mirror,
    );

void main() {
  late _FakeRepo repo;

  ProviderContainer container({
    List<Order> orders = const [],
    List<PendingAction> queue = const [],
    bool online = true,
  }) {
    final c = ProviderContainer(
      overrides: [
        ordersProvider.overrideWithValue(AsyncData(orders)),
        actionQueueProvider.overrideWith(() => _Queue(queue)),
        ordersRepositoryProvider.overrideWith((ref) => repo = _FakeRepo(ref)),
        connectivityProvider.overrideWith((ref) => Stream.value(online)),
        authStateProvider.overrideWith((ref) => const Stream.empty()),
      ],
    );
    addTearDown(c.dispose);
    // Repozitoriy obyektini yaratib qo'yamiz (oqimlar shundan o'qiladi).
    c.read(ordersRepositoryProvider);
    return c;
  }

  Future<AsyncValue<List<OrderItem>>> itemsOf(ProviderContainer c, String id) async {
    final sub = c.listen(orderItemsProvider(id), (_, __) {});
    addTearDown(sub.close);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    return c.read(orderItemsProvider(id));
  }

  group('Mahsulotlar nusxasi', () {
    test("nusxa bor — darhol, alohida obunasiz", () async {
      final c = container(orders: [order(mirror: [item('a', 1), item('b', 2)])]);
      final items = await itemsOf(c, 'o1');
      expect(items.valueOrNull?.map((i) => i.id), ['a', 'b']);
      expect(repo.itemListeners, 0, reason: "Firestore'dan qo'shimcha o'qish yo'q");
    });

    test("navbatdagi o'zgarish nusxa ustiga qo'yiladi", () async {
      final action = PendingAction(
        id: newActionId(),
        path: '/changeItemStatus',
        body: const {},
        orderId: 'o1',
        effect: {
          'kind': EffectKind.itemsChange,
          'upserts': [itemToJson(item('a', 1, status: 'packing'))],
        },
        label: '',
        createdAt: DateTime.now(),
      );
      final c = container(orders: [order(mirror: [item('a', 1), item('b', 2)])], queue: [action]);
      final items = (await itemsOf(c, 'o1')).valueOrNull!;
      expect(items.first.status, 'packing');
      expect(items.first.pendingSync, isTrue);
    });

    test("nusxa yo'q (eski buyurtma) — pastki jamlanmaga obuna", () async {
      final c = container(orders: [order()]);
      repo.items = (items: [item('x', 1)], fromCache: false);
      final items = await itemsOf(c, 'o1');
      expect(items.valueOrNull?.single.id, 'x');
      expect(repo.itemListeners, 1);
    });

    test("internetsiz va keshda yo'q — 'mahsulot yo'q' emas, aniq xabar", () async {
      final c = container(orders: [order()], online: false);
      final items = await itemsOf(c, 'o1');
      expect(items.error, isA<ItemsUnavailableOffline>());
      expect(items.error.toString(), contains("Internet yo'q"));
    });

    test('internet bor, kesh bo\'sh — server javobi kutiladi', () async {
      final c = container(orders: [order()]);
      expect((await itemsOf(c, 'o1')).isLoading, isTrue);
    });

    test('oflayn yaratilgan buyurtmaning mahsulotlari navbatdan', () async {
      final create = PendingAction(
        id: 'new1',
        path: '/createOrder',
        body: const {},
        orderId: 'new1',
        effect: {
          'kind': EffectKind.orderCreate,
          'order': {'id': 'new1', 'serviceType': 'pickup', 'status': 'new', 'createdAt': 0},
          'upserts': [itemToJson(item('new1-0', 1, status: 'pending'))],
          'base': null,
        },
        label: '',
        createdAt: DateTime.now(),
      );
      // ordersProvider override — overlay qo'llangan ro'yxatni o'zimiz beramiz.
      final c = container(orders: applyToOrders(const [], [create]), queue: [create]);
      final items = await itemsOf(c, 'new1');
      expect(items.valueOrNull?.single.id, 'new1-0');
      expect(repo.itemListeners, 0);
    });
  });

  group('Jonli buyurtma', () {
    test("ro'yxatda bor — o'shandan", () async {
      final c = container(orders: [order()]);
      expect(c.read(liveOrderProvider('o1'))?.id, 'o1');
    });

    test("ro'yxatda yo'q — hujjatning o'zidan, navbat qo'llangan holda", () async {
      final update = PendingAction(
        id: newActionId(),
        path: '/updateOrder',
        body: const {},
        orderId: 'z',
        effect: {
          'kind': EffectKind.orderUpdate,
          'fields': {'customerName': 'Yangi ism'},
        },
        label: '',
        createdAt: DateTime.now(),
      );
      final c = container(queue: [update]);
      repo.doc = order(id: 'z');
      final sub = c.listen(liveOrderProvider('z'), (_, __) {});
      addTearDown(sub.close);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(liveOrderProvider('z'))?.customerName, 'Yangi ism');
    });
  });

  test("topshiriq holati navbatdan darhol qo'llanadi, rad etilgani yo'q", () {
    final task = Task(id: 't1', type: 'single', title: 'Ombor', status: 'pending', createdAt: DateTime(2026));
    PendingAction act(String status, {bool failed = false}) => PendingAction(
          id: newActionId(),
          path: '/markTaskDone',
          body: const {},
          effect: {'kind': kTaskStatusEffect, 'taskId': 't1', 'status': status},
          label: '',
          createdAt: DateTime.now(),
          failed: failed,
        );
    expect(applyTaskActions([task], [act('done')]).single.isDone, isTrue);
    expect(applyTaskActions([task], [act('done', failed: true)]).single.isPending, isTrue);
    expect(applyTaskActions([task], const []).single.isPending, isTrue);
  });

  group('Izohlar internetsiz', () {
    Future<void> pump(WidgetTester tester, {required bool online, required bool fromCache}) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ordersRepositoryProvider.overrideWith((ref) {
              final r = _FakeRepo(ref);
              r.comments = (comments: const [], fromCache: fromCache);
              return r;
            }),
            connectivityProvider.overrideWith((ref) => Stream.value(online)),
            authStateProvider.overrideWith((ref) => const Stream.empty()),
            employeeClaimsProvider.overrideWith(
              (ref) async => const EmployeeClaims(employeeId: 'e', role: 'worker', department: 'worker'),
            ),
            actionQueueProvider.overrideWith(_Queue.new),
          ],
          child: const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: CommentsSection(orderId: 'o1')))),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    testWidgets("keshda yo'q va internetsiz — aniq xabar", (tester) async {
      await pump(tester, online: false, fromCache: true);
      expect(find.textContaining("Internet yo'q"), findsOneWidget);
      expect(find.text("Hali izoh yo'q"), findsNothing);
    });

    testWidgets("serverdan bo'sh — 'Hali izoh yo'q'", (tester) async {
      await pump(tester, online: true, fromCache: false);
      expect(find.text("Hali izoh yo'q"), findsOneWidget);
    });
  });
}

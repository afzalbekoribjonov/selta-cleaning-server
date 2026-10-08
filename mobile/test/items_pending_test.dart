import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/bonus_service.dart';
import 'package:selta_cleaning/core/services/catalog_repository.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/services/order_items_provider.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/tariff_settings.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/delivery_order_detail_sheet.dart';
import 'package:selta_cleaning/features/dispatcher/order_detail_sheet.dart';
import 'package:selta_cleaning/features/shared/team_job_detail_sheet.dart';
import 'package:selta_cleaning/features/worker/worker_order_detail_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Mahsulotsiz yaratilgan buyurtmada "Qo'shish" chiqmay qolgan xato:
/// Firestore keshdan bo'sh ro'yxat bergach, server "haqiqatan bo'sh" deb
/// tasdiqlaganini faqat `includeMetadataChanges` bilan yuboradi
/// (orders_repository.dart: watchItems). Bu testlar o'sha hodisa tartibini
/// taqlid qiladi va tugma ro'yxat kelmasa ham ko'rinishini tekshiradi.

class _Queue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

class _Repo extends OrdersRepository {
  _Repo(super.ref);

  @override
  Stream<({List<OrderItem> items, bool fromCache})> watchItems(String orderId) => itemsStream.stream;

  @override
  Stream<({List<Map<String, dynamic>> comments, bool fromCache})> watchComments(String orderId) =>
      Stream.value((comments: const <Map<String, dynamic>>[], fromCache: false));
}

class _Bonus implements BonusService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Firestore'ning mahsulotlar oqimi — test boshqaradi.
late StreamController<({List<OrderItem> items, bool fromCache})> itemsStream;

const cacheEmpty = (items: <OrderItem>[], fromCache: true);
const serverEmpty = (items: <OrderItem>[], fromCache: false);

/// Server mahsulotsiz yaratgan, nusxasi YO'Q buyurtma (tuzatishdan oldingi
/// buyurtmalar shunday) — ilova mahsulotlarni alohida kuzatadi.
Order mirrorless(String status, {String serviceType = 'pickup'}) => Order(
      id: 'o1',
      orderNumber: 501,
      customerName: 'Aziz',
      phone: '+998901234567',
      location: 'Yunusobod',
      serviceType: serviceType,
      tariff: serviceType == 'onsite' ? 'standard' : null,
      status: status,
      assignedTeam: const ['me'],
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 8),
      itemsMirror: null,
    );

Future<void> openSheet(
  WidgetTester tester,
  void Function(BuildContext) open, {
  required Order order,
  required String department,
  bool online = true,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  itemsStream = StreamController.broadcast();
  addTearDown(itemsStream.close);
  tester.view.physicalSize = const Size(412 * 3, 900 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        ordersProvider.overrideWithValue(AsyncData([order])),
        ordersRepositoryProvider.overrideWith(_Repo.new),
        actionQueueProvider.overrideWith(_Queue.new),
        connectivityProvider.overrideWith((ref) => Stream.value(online)),
        authStateProvider.overrideWith((ref) => const Stream.empty()),
        tariffSettingsProvider.overrideWith((ref) => Stream.value(kDefaultTariffs)),
        orderSourcesProvider.overrideWith((ref) => Stream.value(const [])),
        productsProvider.overrideWith((ref) => Stream.value(const [])),
        bonusServiceProvider.overrideWithValue(_Bonus()),
        localStoreProvider.overrideWithValue(LocalStore(prefs)),
        currentEmployeeProvider.overrideWith(
          (ref) => Stream.value({'department': department, 'fullName': 'Ali', 'specializations': ['gilam'], 'canPack': true}),
        ),
        employeeClaimsProvider.overrideWith(
          (ref) async => EmployeeClaims(employeeId: 'me', role: department, department: department),
        ),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(child: TextButton(onPressed: () => open(context), child: const Text('ochish'))),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('ochish'));
  // Yuklanish chizig'i to'xtovsiz aylanadi — pumpAndSettle emas.
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> emit(WidgetTester tester, ({List<OrderItem> items, bool fromCache}) event) async {
  itemsStream.add(event);
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  group('Mahsulotlar oqimi (orderItemsProvider)', () {
    Future<ProviderContainer> make({bool online = true}) async {
      SharedPreferences.setMockInitialValues({});
      itemsStream = StreamController.broadcast();
      addTearDown(itemsStream.close);
      final c = ProviderContainer(overrides: [
        ordersProvider.overrideWithValue(AsyncData([mirrorless('new')])),
        ordersRepositoryProvider.overrideWith(_Repo.new),
        actionQueueProvider.overrideWith(_Queue.new),
        connectivityProvider.overrideWith((ref) => Stream.value(online)),
        authStateProvider.overrideWith((ref) => const Stream.empty()),
      ]);
      addTearDown(c.dispose);
      c.listen(orderItemsProvider('o1'), (_, __) {});
      await c.read(connectivityProvider.future);
      return c;
    }

    Future<void> tick() => Future<void>.delayed(Duration.zero);

    test("keshdan bo'sh → kutadi; server tasdig'i (faqat holat belgisi) → bo'sh ro'yxat", () async {
      final c = await make();
      itemsStream.add(cacheEmpty);
      await tick();
      expect(c.read(orderItemsProvider('o1')).isLoading, isTrue);
      itemsStream.add(serverEmpty);
      await tick();
      final v = c.read(orderItemsProvider('o1'));
      expect(v.hasValue, isTrue);
      expect(v.value, isEmpty);
    });

    test("internet yo'q va kesh bo'sh — xato (\"mahsulot yo'q\" deb adashtirilmaydi)", () async {
      final c = await make(online: false);
      itemsStream.add(cacheEmpty);
      await tick();
      expect(c.read(orderItemsProvider('o1')).error, isA<ItemsUnavailableOffline>());
    });
  });

  group("\"Qo'shish\" ro'yxat kelmasa ham ko'rinadi", () {
    testWidgets('dastavchik — yangi buyurtma', (tester) async {
      await openSheet(tester, (c) => openDeliveryOrderDetailSheet(c, mirrorless('new')), order: mirrorless('new'), department: 'delivery');
      await emit(tester, cacheEmpty);
      expect(find.byType(LinearProgressIndicator), findsWidgets);
      expect(find.text("Qo'shish"), findsOneWidget, reason: "ro'yxat kutilayotgan bo'lsa ham");

      await emit(tester, serverEmpty);
      expect(find.byType(LinearProgressIndicator), findsNothing, reason: "server tasdig'i bilan yuklanish tugaydi");
      expect(find.textContaining('Mijoz oldida mahsulot belgilashingiz mumkin'), findsOneWidget);

      await tester.tap(find.text("Qo'shish"));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('Katalogdan tanlang'), findsOneWidget, reason: 'katalog oynasi ochildi');
    });

    testWidgets("ishchi — \"O'zi keldi\" buyurtmasi: Belgilash", (tester) async {
      await openSheet(tester, (c) => openWorkerOrderDetailSheet(c, mirrorless('brought_in')),
          order: mirrorless('brought_in'), department: 'worker');
      await emit(tester, cacheEmpty);
      expect(find.text('Belgilash'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsWidgets);
    });

    testWidgets('joyida yuvish jamoasi', (tester) async {
      final o = mirrorless('in_progress', serviceType: 'onsite');
      await openSheet(tester, (c) => openTeamJobDetailSheet(c, o), order: o, department: 'worker');
      await emit(tester, cacheEmpty);
      expect(find.text("Qo'shish"), findsOneWidget);
    });

    testWidgets('sotuv menejeri — yangi buyurtma', (tester) async {
      await openSheet(tester, (c) => openOrderDetailSheet(c, mirrorless('new')), order: mirrorless('new'), department: 'dispatcher');
      await emit(tester, cacheEmpty);
      expect(find.text("Qo'shish"), findsOneWidget);
    });

    testWidgets("internet yo'q, kesh bo'sh — xabar va baribir Qo'shish (navbat orqali)", (tester) async {
      await openSheet(tester, (c) => openDeliveryOrderDetailSheet(c, mirrorless('new')),
          order: mirrorless('new'), department: 'delivery', online: false);
      await emit(tester, cacheEmpty);
      expect(find.textContaining("Internet yo'q"), findsWidgets);
      expect(find.text("Qo'shish"), findsOneWidget);
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/order_items_provider.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/overlay.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/delivery_payment_sheet.dart';
import 'package:selta_cleaning/features/shared/prepayment_section.dart';

class _RecordingQueue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];

  @override
  void enqueue(PendingAction action) => state = [...state, action];

  @override
  void discard(String actionId) => state = state.where((a) => a.id != actionId).toList();
}

class _DeliverCall {
  final num paid;
  final num? prepaidUsedAfter;
  final String? kind;
  const _DeliverCall(this.paid, this.prepaidUsedAfter, this.kind);
}

class _FakeRepo extends OrdersRepository {
  final List<_DeliverCall> delivered;
  _FakeRepo(super.ref, this.delivered);

  @override
  Future<void> deliverOrderItems({
    required String orderId,
    required List<String> itemIds,
    required num paidAmount,
    required num cashAmount,
    required num cardAmount,
    String? kind,
    String? note,
    String? actorName,
    num? prepaidUsedAfter,
    Map<String, num>? paymentSummaryAfter,
  }) async {
    delivered.add(_DeliverCall(paidAmount, prepaidUsedAfter, kind));
  }
}

Prepayment prepay(String id, num amount, {String employeeId = 'sm', DateTime? at, num card = 0}) => Prepayment(
      id: id,
      amount: amount,
      cashAmount: amount - card,
      cardAmount: card,
      at: at ?? DateTime.now(),
      employeeId: employeeId,
      employeeName: 'Dilnoza Abdullayeva',
      note: 'Zaklad — mijoz ertaga qolganini beradi',
    );

Order sample({
  num total = 140000,
  num prepaid = 0,
  num used = 0,
  List<Prepayment> prepayments = const [],
  String status = 'brought_in',
}) =>
    Order(
      id: 'o1',
      orderNumber: 1245,
      customerName: 'Aziz Karimov',
      phone: '+998901234567',
      location: 'Yunusobod',
      serviceType: 'pickup',
      status: status,
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      totalPrice: total,
      prepaidAmount: prepaid,
      prepaidUsed: used,
      prepayments: prepayments,
      itemStatusCounts: const {'ready': 2},
    );

OrderItem item(String id, num price) => OrderItem(id: id, itemNumber: id == 'i1' ? 1 : 2, name: 'Gilam $id', area: 0, price: price, qcStatus: 'pending', status: 'ready');

void main() {
  group('Model', () {
    test('qoldiq va yana olinadigan summa', () {
      expect(sample(prepaid: 100000, used: 30000).prepaidCredit, 70000);
      expect(sample(prepaid: 10000, used: 30000).prepaidCredit, 0);
      expect(sample(total: 140000, prepaid: 100000).remainingToPay, 40000);
      expect(sample(total: 90000, prepaid: 100000).remainingToPay, -10000);
    });

    test("Prepayment: navbat JSON'i orqali aylanib keladi", () {
      final p = prepay('p1', 50000, card: 20000, at: DateTime(2026, 10, 5, 14, 30));
      final back = Prepayment.fromMap(p.toJson());
      expect((back.id, back.amount, back.cashAmount, back.cardAmount, back.at), ('p1', 50000, 30000, 20000, DateTime(2026, 10, 5, 14, 30)));
      expect(back.note, p.note);
    });
  });

  group('Overlay', () {
    test("oldindan to'lov darhol ko'rinadi va qayta qo'llash ikki barobar qilmaydi", () {
      final container = ProviderContainer(
        overrides: [
          actionQueueProvider.overrideWith(_RecordingQueue.new),
          employeeClaimsProvider.overrideWith((ref) async => const EmployeeClaims(employeeId: 'sm', role: 'dispatcher', department: 'dispatcher')),
        ],
      );
      addTearDown(container.dispose);
      container.read(actionQueueProvider);

      final order = sample(prepaid: 20000, prepayments: [prepay('old', 20000)]);
      container.read(ordersRepositoryProvider).addPrepayment(order: order, amount: 50000, cashAmount: 50000, cardAmount: 0);
      final action = container.read(actionQueueProvider).single;
      expect(action.path, '/addPrepayment');
      expect(action.body['prepaymentId'], action.id);
      expect(action.body.containsKey('note'), isFalse);

      final shown = applyToOrders([order], [action]).single;
      expect(shown.prepaidAmount, 70000);
      expect(shown.prepayments.map((p) => p.id), ['old', action.id]);

      // Server qo'llab bo'ldi (hujjatda allaqachon 70 000) — qiymat mutlaq.
      final server = sample(prepaid: 70000, prepayments: shown.prepayments);
      expect(applyToOrders([server], [action]).single.prepaidAmount, 70000);
    });

    test("repozitoriy yozishi ro'yxat ochiq turganda ham aylanma bog'liqliksiz", () {
      final container = ProviderContainer(
        overrides: [
          actionQueueProvider.overrideWith(_RecordingQueue.new),
          employeeClaimsProvider.overrideWith((ref) async => null),
        ],
      );
      addTearDown(container.dispose);
      // Ekrandagi ro'yxat allaqachon kuzatilmoqda (ilovadagi kabi).
      container.listen(ordersProvider, (_, __) {});
      container.listen(orderItemsProvider('o1'), (_, __) {});

      final repo = container.read(ordersRepositoryProvider);
      expect(() => repo.addPrepayment(order: sample(), amount: 1000, cashAmount: 1000, cardAmount: 0), returnsNormally);
      expect(
        () => repo.updateOrder(orderId: 'o1', customerName: 'A', phone: '+998901234567', location: 'L'),
        returnsNormally,
      );
      expect(container.read(actionQueueProvider), hasLength(2));
    });

    test('topshirishdagi prepaidUsed faqat server hali qo\'llamagan bo\'lsa', () {
      final order = sample(prepaid: 100000);
      PendingAction deliver(String? base) => PendingAction(
            id: newActionId(),
            path: '/deliverOrderItems',
            body: const {},
            orderId: 'o1',
            effect: {'kind': EffectKind.itemsChange, 'base': base, 'prepaidUsed': 80000},
            label: '',
            createdAt: DateTime.now(),
          );
      expect(applyToOrders([order], [deliver(orderSignature(order))]).single.prepaidUsed, 80000);
      expect(applyToOrders([order], [deliver('boshqa-holat')]).single.prepaidUsed, 0);
    });
  });

  group('PrepaymentSection', () {
    Future<void> pumpSection(
      WidgetTester tester,
      Order order, {
      bool canTake = false,
      double width = 360,
      double scale = 1,
    }) async {
      tester.view.physicalSize = Size(width * 3, 1600 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [
            currentEmployeeProvider.overrideWith((ref) => Stream.value({'canTakePrepayment': canTake, 'fullName': 'Dilnoza'})),
            employeeClaimsProvider.overrideWith(
              (ref) async => const EmployeeClaims(employeeId: 'sm', role: 'dispatcher', department: 'dispatcher'),
            ),
            actionQueueProvider.overrideWith(_RecordingQueue.new),
          ],
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: Scaffold(body: ListView(padding: const EdgeInsets.all(20), children: [PrepaymentSection(order: order)])),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets("to'lov ham, vakolat ham yo'q — ko'rinmaydi", (tester) async {
      await pumpSection(tester, sample());
      expect(find.text("Oldindan to'lov"), findsNothing);
    });

    testWidgets("vakolat bor — qabul qilish tugmasi; yakunlanganda yo'q", (tester) async {
      await pumpSection(tester, sample(), canTake: true);
      expect(find.text("Oldindan to'lov qabul qilish"), findsOneWidget);
      await pumpSection(tester, sample(status: 'done'), canTake: true);
      expect(find.text("Oldindan to'lov"), findsNothing);
    });

    testWidgets("to'lovlar, qoldiq va bekor qilish — vakolatsiz ham ko'rinadi", (tester) async {
      await pumpSection(
        tester,
        sample(total: 140000, prepaid: 100000, prepayments: [prepay('p1', 60000), prepay('p2', 40000, employeeId: 'other', card: 40000)]),
      );
      expect(find.text("100 000 so'm"), findsOneWidget);
      expect(find.text('Topshirishda olinadi'), findsOneWidget);
      expect(find.text("40 000 so'm"), findsWidgets);
      // O'zi bugun qabul qilgani bekor qilinadi, boshqaniki — yo'q.
      expect(find.byTooltip("To'lovni bekor qilish"), findsOneWidget);
      expect(find.textContaining('Karta ·'), findsOneWidget);
    });

    testWidgets('ortiqcha to\'lov yakunda ogohlantiriladi', (tester) async {
      await pumpSection(tester, sample(total: 90000, prepaid: 100000, used: 90000, status: 'done', prepayments: [prepay('p1', 100000)]));
      expect(find.text('Ortiqcha — mijozga qaytariladi'), findsOneWidget);
      expect(find.text("10 000 so'm"), findsOneWidget);
    });

    testWidgets("kichik ekran va katta shriftda toshmaydi", (tester) async {
      await pumpSection(
        tester,
        sample(total: 123456789, prepaid: 99999999, prepayments: [prepay('p1', 99999999, card: 33333333)]),
        canTake: true,
        width: 320,
        scale: 1.3,
      );
      expect(tester.takeException(), isNull);
      await tester.tap(find.text("Qo'shish"));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, '123456789');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets("qo'shish oynasi navbatga to'g'ri summani qo'yadi", (tester) async {
      await pumpSection(tester, sample(), canTake: true);
      await tester.tap(find.text("Oldindan to'lov qabul qilish"));
      await tester.pumpAndSettle();

      await tester.tap(find.text('QABUL QILISH'));
      await tester.pump();
      expect(find.text('Summani kiriting'), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, '50000');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('QABUL QILISH'));
      await tester.tap(find.text('QABUL QILISH'));
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(tester.element(find.byType(PrepaymentSection)));
      final action = container.read(actionQueueProvider).single;
      expect((action.body['amount'], action.body['cashAmount'], action.body['cardAmount']), (50000, 50000, 0));
      expect(action.body['actorName'], 'Dilnoza');
    });
  });

  group('Topshirish oynasi', () {
    Future<List<_DeliverCall>> pumpPayment(WidgetTester tester, Order order, List<OrderItem> items) async {
      tester.view.physicalSize = const Size(360 * 3, 1600 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final calls = <_DeliverCall>[];
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ordersRepositoryProvider.overrideWith((ref) => _FakeRepo(ref, calls)),
            currentEmployeeProvider.overrideWith((ref) => Stream.value({'fullName': 'Ali'})),
            actionQueueProvider.overrideWith(_RecordingQueue.new),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => Center(
                  child: TextButton(
                    onPressed: () => openDeliveryPaymentSheet(context, order: order, readyItems: items),
                    child: const Text('ochish'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('ochish'));
      await tester.pumpAndSettle();
      return calls;
    }

    testWidgets("qoldiq narxdan ayiriladi va to'liq summa shunga teng", (tester) async {
      final calls = await pumpPayment(tester, sample(prepaid: 100000), [item('i1', 80000), item('i2', 60000)]);
      expect(find.text("Oldindan to'langan"), findsOneWidget);
      expect(find.text("-100 000 so'm"), findsOneWidget);
      expect(find.text("40 000 so'm"), findsOneWidget, reason: "140 000 − 100 000");

      await tester.tap(find.text("To'liq summani kiritish"));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.textContaining('Topshirish ('));
      await tester.tap(find.textContaining('Topshirish ('));
      await tester.pumpAndSettle();
      expect(calls.single.paid, 40000);
      expect(calls.single.kind, isNull);
      expect(calls.single.prepaidUsedAfter, 100000);
    });

    testWidgets("to'liq oldindan to'langan — summa kiritmasdan topshiriladi", (tester) async {
      final calls = await pumpPayment(tester, sample(prepaid: 150000), [item('i1', 80000), item('i2', 60000)]);
      expect(find.text("0 so'm"), findsOneWidget);
      await tester.ensureVisible(find.textContaining('Topshirish ('));
      await tester.tap(find.textContaining('Topshirish ('));
      await tester.pumpAndSettle();
      expect((calls.single.paid, calls.single.prepaidUsedAfter), (0, 140000));
    });

    testWidgets("oldindan to'lovsiz — avvalgidek", (tester) async {
      final calls = await pumpPayment(tester, sample(), [item('i1', 80000)]);
      expect(find.text("Oldindan to'langan"), findsNothing);
      await tester.ensureVisible(find.textContaining('Topshirish ('));
      await tester.tap(find.textContaining('Topshirish ('));
      await tester.pump();
      expect(find.text('Mijozdan olingan summani kiriting'), findsOneWidget);
      expect(calls, isEmpty);
    });
  });
}

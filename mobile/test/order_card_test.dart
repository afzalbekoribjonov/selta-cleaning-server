import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/services/my_activity_repository.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/delivery_home_screen.dart';
import 'package:selta_cleaning/features/dispatcher/widgets/order_card.dart';

Order longOrder({String service = 'pickup', String status = 'brought_in', Map<String, int>? counts, String? tariff}) => Order(
      id: 'o1',
      orderNumber: 123456,
      customerName: 'Abdurahmonov Abdulazizxon Muhammadqodir o\'g\'li',
      phone: '+998901234567',
      location: "Yunusobod tumani, 19-kvartal, 37-uy, 112-xonadon, mo'ljal: Mega Planet savdo markazi orqasi",
      serviceType: service,
      status: status,
      tariff: tariff,
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      totalPrice: 12345678,
      itemStatusCounts: counts ?? const {'ready': 2, 'washing': 1, 'packing': 1, 'returned': 3, 'pending': 4},
      earliestPendingDueDate: DateTime(2026, 9, 20),
      dueDate: DateTime(2026, 9, 20),
      pendingSync: true,
    );

Future<void> pumpAt(WidgetTester tester, double width, Widget child, {double textScale = 1}) async {
  tester.view.physicalSize = Size(width * 3, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 800), textScaler: TextScaler.linear(textScale)),
        child: Scaffold(body: ListView(children: [child])),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  for (final width in [320.0, 360.0, 412.0]) {
    testWidgets('uzun ma\'lumot ${width.toInt()}px ekranda toshib ketmaydi', (tester) async {
      await pumpAt(
        tester,
        width,
        OrderCard(
          order: longOrder(),
          onTap: () {},
          facts: [
            CardFact.stages(longOrder()),
            const CardFact(Icons.payments_rounded, "Yig'ish: 12 345 678 so'm — juda uzun izoh matni bilan", strong: true),
          ],
          trailing: '~18 km',
        ),
      );
      // Toshib ketish bo'lsa Flutter testni o'zi xato bilan tugatadi.
      expect(tester.takeException(), isNull);
      expect(find.textContaining('#123456'), findsOneWidget);
    });
  }

  // Ko'p xodimlar telefonda shriftni kattalashtiradi — 1.3x da ham
  // hech narsa ekrandan chiqmasligi kerak.
  for (final width in [360.0, 412.0]) {
    testWidgets('katta shrift (1.3x) ${width.toInt()}px da toshib ketmaydi', (tester) async {
      await pumpAt(
        tester,
        width,
        OrderCard(
          order: longOrder(),
          onTap: () {},
          facts: [CardFact.stages(longOrder())],
          trailing: '~4.2 km',
        ),
        textScale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('joyida yuvish + tarif + jamoa ogohlantirishi tor ekranda', (tester) async {
    await pumpAt(
      tester,
      320,
      OrderCard(order: longOrder(service: 'onsite', status: 'new', counts: const {}, tariff: 'standart'), onTap: () {}),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Jamoa biriktirilmagan'), findsOneWidget);
  });

  testWidgets('oflayn yaratilgan buyurtmada "#0" emas, "#…"', (tester) async {
    final o = longOrder().copyWith(orderNumber: 0);
    await pumpAt(tester, 360, OrderCard(order: o, onTap: () {}));
    expect(find.text('#…'), findsOneWidget);
    expect(find.textContaining('#0'), findsNothing);
  });

  group('kartadagi holat', () {
    Order pickup(Map<String, int> counts) => longOrder(counts: counts);

    test('hammasi tayyor — "Tayyor"', () => expect(orderStage(pickup({'ready': 3})).label, 'Tayyor'));
    test('qisman — "2/4 tayyor"', () => expect(orderStage(pickup({'ready': 2, 'washing': 2})).label, '2/4 tayyor'));
    test('oldin yetkazilgani hisobga olinmaydi', () {
      expect(orderStage(pickup({'ready': 1, 'done': 3})).label, 'Tayyor');
    });
  });

  group('bugun topshirilganlar', () {
    StageEntry logged(String orderId, String itemId, num price) => StageEntry(
          id: 'delivered__${itemId}__2026-10-05',
          at: DateTime(2026, 10, 5, 12),
          orderId: orderId,
          itemId: itemId,
          orderNumber: 10,
          customerName: 'Aziz',
          itemName: 'Gilam',
          itemNumber: 1,
          unitLabel: 'm²',
          unitAmount: 4,
          price: price,
        );

    PendingAction pending(String orderId, List<String> itemIds, num paid, {bool failed = false, DateTime? at}) =>
        PendingAction(
          id: newActionId(),
          path: '/deliverOrderItems',
          body: {'orderId': orderId, 'itemIds': itemIds, 'paidAmount': paid},
          orderId: orderId,
          effect: const {'kind': 'items.change'},
          label: '',
          createdAt: at ?? DateTime(2026, 10, 5, 15),
          failed: failed,
        );

    final today = DateTime(2026, 10, 5, 18);

    test('jurnal mahsulot bo\'yicha — buyurtma bo\'yicha guruhlanadi', () {
      final rows = groupDelivered([logged('o1', 'i1', 100), logged('o1', 'i2', 50)], const [], today: today);
      expect(rows.single.itemCount, 2);
      expect(rows.single.amount, 150);
      expect(rows.single.pending, isFalse);
    });

    test('oflayn topshirilgani qo\'shiladi', () {
      final rows = groupDelivered([], [pending('o2', ['x1', 'x2'], 300)], today: today);
      expect(rows.single.itemCount, 2);
      expect(rows.single.amount, 300);
      expect(rows.single.pending, isTrue);
    });

    test('server jurnaliga tushgach IKKI MARTA sanalmaydi', () {
      final rows = groupDelivered([logged('o2', 'x1', 150), logged('o2', 'x2', 150)], [pending('o2', ['x1', 'x2'], 300)], today: today);
      expect(rows.single.itemCount, 2);
      expect(rows.single.amount, 300);
    });

    test('rad etilgan va kechagi topshirish kirmaydi', () {
      final rows = groupDelivered(
        [],
        [
          pending('o3', ['a'], 100, failed: true),
          pending('o4', ['b'], 100, at: DateTime(2026, 10, 4, 20)),
        ],
        today: today,
      );
      expect(rows, isEmpty);
    });
  });
}

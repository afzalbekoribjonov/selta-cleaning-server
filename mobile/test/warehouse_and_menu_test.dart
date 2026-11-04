import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/warehouse_settings.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/shared/employee_app_bar.dart';
import 'package:selta_cleaning/features/warehouse/warehouse_screen.dart';

class _EmptyQueue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

/// Buyurtma: har bir son — shu mahsulot necha kundan beri tayyor.
Order ready(String id, int number, List<int> readyAgo) {
  final now = DateTime.now();
  final items = [
    for (var i = 0; i < readyAgo.length; i++)
      OrderItem(
        id: '$id-$i',
        itemNumber: i + 1,
        name: 'Gilam $id$i',
        area: 0,
        price: 100000,
        qcStatus: 'passed',
        status: 'ready',
        packedAt: now.subtract(Duration(days: readyAgo[i], hours: 1)),
      ),
  ];
  return Order(
    id: id,
    orderNumber: number,
    customerName: 'Mijoz $id',
    phone: '+998901112233',
    location: 'Manzil',
    serviceType: 'pickup',
    status: 'brought_in',
    createdBy: 'e',
    createdAt: now.subtract(const Duration(days: 40)),
    itemStatusCounts: {'ready': readyAgo.length},
    totalPrice: 100000 * readyAgo.length,
    itemsMirror: items,
  );
}

List<Override> base({required Map<String, dynamic> employee, List<Order> orders = const []}) => [
      ordersProvider.overrideWithValue(AsyncData(orders)),
      currentEmployeeProvider.overrideWith((ref) => Stream.value(employee)),
      warehouseReadyDaysProvider.overrideWith((ref) => Stream.value(5)),
      actionQueueProvider.overrideWith(_EmptyQueue.new),
      connectivityProvider.overrideWith((ref) => Stream.value(true)),
    ];

void main() {
  testWidgets('omborda har bir mahsulot alohida: faqat 5+ kun tayyorlari, eng uzoq turgani tepada', (tester) async {
    tester.view.physicalSize = const Size(360 * 3, 760 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: base(
          employee: {'department': 'dispatcher', 'canAccessWarehouse': true},
          orders: [
            ready('a', 101, [12, 2]), // faqat birinchisi omborda
            ready('b', 102, [30]),
            ready('c', 103, [4]), // hali chegarada emas
          ],
        ),
        child: const MaterialApp(home: WarehouseScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    expect(find.text('Gilam a0'), findsOneWidget);
    expect(find.text('Gilam a1'), findsNothing, reason: '2 kun — hali omborda emas');
    expect(find.text('Gilam b0'), findsOneWidget);
    expect(find.text('Gilam c0'), findsNothing);
    expect(find.text('101/1'), findsOneWidget, reason: 'mahsulot raqami bilan');
    expect(find.text('Yana 1 ta mahsuloti omborda emas'), findsOneWidget);
    expect(find.text('12 kun'), findsOneWidget);

    final b = tester.getTopLeft(find.text('Gilam b0')).dy;
    final a = tester.getTopLeft(find.text('Gilam a0')).dy;
    expect(b, lessThan(a), reason: '30 kun turgani tepada');
  });

  Future<List<String>> menuItems(WidgetTester tester, Map<String, dynamic> employee) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: base(employee: employee),
        child: MaterialApp(
          home: Scaffold(appBar: const EmployeeAppBar(departmentLabel: 'Ishchi', employeeName: 'Test')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_vert_rounded));
    await tester.pumpAndSettle();
    final labels = tester.widgetList<Text>(
      find.descendant(of: find.byWidgetPredicate((w) => w is PopupMenuItem), matching: find.byType(Text)),
    );
    final result = [for (final t in labels) t.data ?? ''];
    // Menyu yopiladi — keyingi tekshiruv toza boshlansin.
    await tester.tapAt(const Offset(5, 500));
    await tester.pumpAndSettle();
    return result;
  }

  testWidgets('⋮ menyu: vakolatsiz xodimda faqat umumiy bandlar', (tester) async {
    final items = await menuItems(tester, {'department': 'worker'});
    expect(items, ['Bugungi ishim', 'Sinxronlash holati']);
  });

  testWidgets('⋮ menyu: vakolatlar berilganda tegishli bandlar paydo bo\'ladi', (tester) async {
    final items = await menuItems(tester, {
      'department': 'worker',
      'canCreateOrders': true,
      'canViewStats': true,
      'canAccessWarehouse': true,
    });
    expect(items, containsAllInOrder(['Yangi buyurtma', "Kunlik ko'rsatkichlar", 'Omborxona', 'Bugungi ishim']));
  });

  testWidgets('⋮ menyu: sotuv menejerida "Yangi buyurtma" takrorlanmaydi', (tester) async {
    final items = await menuItems(tester, {'department': 'dispatcher', 'canCreateOrders': true});
    expect(items, isNot(contains('Yangi buyurtma')));
  });
}

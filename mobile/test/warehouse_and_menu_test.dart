import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
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

Order ready(String id, int daysLate) {
  final now = DateTime.now();
  return Order(
    id: id,
    orderNumber: 100 + daysLate,
    customerName: 'Mijoz $id',
    phone: '+998901112233',
    location: 'Manzil',
    serviceType: 'pickup',
    status: 'brought_in',
    createdBy: 'e',
    createdAt: now.subtract(const Duration(days: 40)),
    itemStatusCounts: const {'ready': 2},
    totalPrice: 200000,
    earliestPendingDueDate: DateTime(now.year, now.month, now.day).subtract(Duration(days: daysLate)),
  );
}

List<Override> base({required Map<String, dynamic> employee, List<Order> orders = const []}) => [
      ordersProvider.overrideWithValue(AsyncData(orders)),
      currentEmployeeProvider.overrideWith((ref) => Stream.value(employee)),
      warehouseThresholdProvider.overrideWith((ref) => Stream.value(10)),
      actionQueueProvider.overrideWith(_EmptyQueue.new),
      connectivityProvider.overrideWith((ref) => Stream.value(true)),
    ];

void main() {
  testWidgets('omborda faqat chegaradan o\'tganlar, eng uzoq turgani birinchi', (tester) async {
    tester.view.physicalSize = const Size(360 * 3, 760 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: base(
          employee: {'department': 'dispatcher', 'canAccessWarehouse': true},
          orders: [ready('a', 12), ready('b', 30), ready('c', 10), ready('d', 3)],
        ),
        child: const MaterialApp(home: WarehouseScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    expect(find.text('Mijoz a'), findsOneWidget);
    expect(find.text('Mijoz b'), findsOneWidget);
    expect(find.text('Mijoz c'), findsNothing, reason: '10 kun — hali chegarada');
    expect(find.text('Mijoz d'), findsNothing);
    expect(find.textContaining('2 ta buyurtma'), findsOneWidget);

    final b = tester.getTopLeft(find.text('Mijoz b')).dy;
    final a = tester.getTopLeft(find.text('Mijoz a')).dy;
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

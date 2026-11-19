import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/photos/photo_queue.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/my_activity_repository.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/staff_directory.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/delivery_home_screen.dart';

class _EmptyQueue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

Order o(String id, {String status = 'brought_in', Map<String, int> counts = const {}, String? gps, num price = 150000}) => Order(
      id: id,
      orderNumber: id.hashCode.abs() % 9000 + 1000,
      customerName: 'Mijoz $id juda uzun ism familiyasi bilan',
      phone: '+998901234567',
      location: 'Chilonzor 9-kvartal, uzun manzil matni va mo\'ljal',
      serviceType: 'pickup',
      status: status,
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      itemStatusCounts: counts,
      totalPrice: price,
      gpsCoords: gps,
      earliestPendingDueDate: DateTime(2026, 10, 9),
    );

void main() {
  final orders = [
    o('new1', status: 'new'),
    o('new2', status: 'new', gps: '41.3,69.2'),
    o('almost', counts: const {'ready': 2, 'washing': 1, 'packing': 1}),
    o('ready1', counts: const {'ready': 3}, gps: '41.31,69.28', price: 420000),
    o('ready2', counts: const {'ready': 1, 'done': 2}),
    o('washing', counts: const {'washing': 2}),
  ];

  final teamJob = Order(
    id: 'team1',
    orderNumber: 4321,
    customerName: 'Joyida mijoz',
    phone: '+998901112233',
    location: 'Yunusobod 4-mavze',
    serviceType: 'onsite',
    status: 'in_progress',
    createdBy: 'e',
    createdAt: DateTime(2026, 10, 1),
    totalPrice: 900000,
    tariff: 'express',
    assignedTeam: const ['e1', 'w7'],
  );

  Future<void> pump(WidgetTester tester, {List<Order> team = const []}) async {
    tester.view.physicalSize = const Size(360 * 3, 760 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ordersProvider.overrideWithValue(AsyncData(orders)),
          currentEmployeeProvider.overrideWith((ref) => Stream.value({'fullName': 'Dastavchik Test', 'department': 'delivery'})),
          employeeClaimsProvider.overrideWith(
            (ref) async => const EmployeeClaims(employeeId: 'e1', role: 'delivery', department: 'delivery'),
          ),
          myTeamOrdersProvider.overrideWith((ref, id) => AsyncData(team)),
          staffDirectoryProvider.overrideWith((ref) async => const {
                'e1': StaffInfo(id: 'e1', fullName: 'Dastavchik Test', department: 'delivery', departmentLabel: 'Dastavchik'),
                'w7': StaffInfo(
                  id: 'w7',
                  fullName: 'Yuvuvchi Aliyev',
                  department: 'worker',
                  departmentLabel: 'Ishchi',
                  specializations: ['gilam', 'parda'],
                  canPack: true,
                ),
              }),
          actionQueueProvider.overrideWith(_EmptyQueue.new),
          photoQueueProvider.overrideWith(_NoPhotos.new),
          connectivityProvider.overrideWith((ref) => Stream.value(true)),
          myDailyActivityProvider.overrideWith((ref) async => MyDailyActivity.fromJson({
                'date': '2026-10-05',
                'delivered': {
                  'rows': [
                    {
                      'id': 'delivered__i1__2026-10-05',
                      'at': '2026-10-05T09:30:00Z',
                      'orderId': 'done1',
                      'itemId': 'i1',
                      'orderNumber': 777,
                      'customerName': 'Bugungi mijoz',
                      'itemName': 'Gilam',
                      'price': 250000,
                    },
                  ],
                },
              })),
        ],
        child: const MaterialApp(home: DeliveryHomeScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('bo\'limlar to\'g\'ri taqsimlanadi va 360px da toshib ketmaydi', (tester) async {
    await pump(tester);
    expect(tester.takeException(), isNull);

    // Yangi — 2 ta
    expect(find.textContaining('Mijoz new1'), findsOneWidget);
    expect(find.textContaining('Mijoz new2'), findsOneWidget);
    expect(find.textContaining('Mijoz ready1'), findsNothing);

    // Qisman tayyor
    await tester.tap(find.text('Qisman'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('Mijoz almost'), findsOneWidget);
    expect(find.text('2/4 tayyor'), findsWidgets);
    expect(find.textContaining('Mijoz ready1'), findsNothing);

    // Tayyor — oldin qisman yetkazilgani ham shu yerda
    await tester.tap(find.text('Tayyor'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('Mijoz ready1'), findsOneWidget);
    expect(find.textContaining('Mijoz ready2'), findsOneWidget);
    expect(find.textContaining('Mijoz washing'), findsNothing);
    expect(find.textContaining("Yig'ish"), findsNWidgets(2));

    // Eng qimmat saralash — tor ekranda tugmalar gorizontal suriladi.
    await tester.drag(find.text('Barchasi'), const Offset(-400, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Eng qimmat'));
    await tester.pumpAndSettle();
    final first = tester.getTopLeft(find.textContaining('Mijoz ready1')).dy;
    final second = tester.getTopLeft(find.textContaining('Mijoz ready2')).dy;
    expect(first, lessThan(second), reason: '420 000 so\'mlik yuqorida');

    // Yetkazildi — bugungi jurnaldan
    await tester.tap(find.text('Yetkazildi'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('Bugungi mijoz'), findsOneWidget);
    expect(find.textContaining('1 ta buyurtma'), findsOneWidget);
  });

  testWidgets('bo\'lim ichidagi qidiruv faqat shu bo\'limdan', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'ready1');
    await tester.pumpAndSettle();
    // "Yangi" bo'limida — boshqa bo'limdagi buyurtma chiqmaydi.
    expect(find.textContaining('Mijoz ready1'), findsNothing);
    expect(find.text("Bu bo'limda buyurtma yo'q"), findsOneWidget);
  });

  testWidgets("Joyida yuvish — yuqoridagi belgi soni bilan, alohida sahifada jamoa kasbi bilan", (tester) async {
    await pump(tester, team: [teamJob]);
    expect(tester.takeException(), isNull);
    // Bosh ekranda joyida yuvish bo'limi yo'q — faqat yuqoridagi belgi.
    expect(find.text('Joyida mijoz'), findsNothing);
    final badge = find.descendant(of: find.byTooltip('Joyida yuvish — 1 ta'), matching: find.text('1'));
    expect(badge, findsOneWidget);

    await tester.tap(badge);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Joyida mijoz'), findsOneWidget);
    expect(find.text('Yuvuvchi Aliyev'), findsOneWidget);
    expect(find.textContaining('Ishchi · Gilam, Parda'), findsOneWidget);
  });

  testWidgets("Topshiriqlar belgisi — topshiriq yo'q bo'lsa son ko'rinmaydi", (tester) async {
    await pump(tester);
    expect(find.byTooltip('Topshiriqlar'), findsOneWidget);
    expect(find.descendant(of: find.byTooltip('Topshiriqlar'), matching: find.byType(Text)), findsNothing);
  });
}

class _NoPhotos extends PhotoQueue {
  @override
  List<PhotoOp> build() => const [];
}

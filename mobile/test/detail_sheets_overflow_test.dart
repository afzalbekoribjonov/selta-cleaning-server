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
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/tariff_settings.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/delivery_order_detail_sheet.dart';
import 'package:selta_cleaning/features/delivery/delivery_payment_sheet.dart';
import 'package:selta_cleaning/features/dispatcher/order_detail_sheet.dart';
import 'package:selta_cleaning/features/shared/item_detail_row.dart';
import 'package:selta_cleaning/features/shared/team_job_detail_sheet.dart';
import 'package:selta_cleaning/features/worker/worker_order_detail_sheet.dart';

/// Ichki kartalar ENG OG'IR ma'lumot bilan — uzun nomlar, katta summalar,
/// o'lchanmagan/rad etilgan mahsulotlar, holat va tarif belgilari — tor
/// ekran va katta shriftda ham sig'ishi kerak.

class _Queue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

class _Repo extends OrdersRepository {
  _Repo(super.ref);

  @override
  Stream<({List<Map<String, dynamic>> comments, bool fromCache})> watchComments(String orderId) => Stream.value((
        comments: [
          {
            'id': 'c1',
            'authorId': 'x',
            'authorName': 'Sotuv menejeri Abdulazizxon Abdurahmonov',
            'text': 'Mijoz faqat kechqurun soat 19:00 dan keyin uyda bo\'ladi. ' * 3,
          },
        ],
        fromCache: false,
      ));
}

class _Bonus implements BonusService {
  @override
  Future<CustomerBonus> fetch(String phone) async =>
      const CustomerBonus(balance: 98765432, earnedTotal: 123456789, spentTotal: 0, percent: 1);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _longName = "Gilam (qo'lda to'qilgan, juda iflos, dog'lari ko'p) — mehmonxona uchun";

List<OrderItem> nastyItems() => [
      OrderItem(
        id: 'i1',
        itemNumber: 1,
        name: _longName,
        area: 123.45,
        price: 12345678,
        qcStatus: 'pending',
        calcType: 'sqm',
        qty: 123.45,
        width: 10.55,
        height: 11.7,
        condition: 'veryBad',
        conditionSurchargePercent: 50,
        tariff: 'express',
        status: 'washing',
        category: 'gilam',
        createdAt: DateTime(2026, 9, 1),
        dueDate: DateTime(2026, 9, 5),
      ),
      OrderItem(
        id: 'i2',
        itemNumber: 12,
        name: _longName,
        area: 0,
        price: 0,
        qcStatus: 'failed',
        qcNote: "Dog'lar ketmadi, qayta yuvish kerak — ayniqsa chetlari va o'rtasi",
        calcType: 'sqm',
        condition: 'bad',
        conditionSurchargePercent: 25,
        tariff: 'comfort',
        status: 'pending',
        category: 'gilam',
        createdAt: DateTime(2026, 9, 1),
      ),
      OrderItem(
        id: 'i3',
        itemNumber: 3,
        name: 'Parda',
        area: 0,
        price: 9999999,
        qcStatus: 'passed',
        calcType: 'kg',
        qty: 1234.5,
        tariff: 'premium',
        status: 'ready',
        createdAt: DateTime(2026, 9, 1),
      ),
      OrderItem(
        id: 'i4',
        itemNumber: 4,
        name: _longName,
        area: 0,
        price: 450000,
        qcStatus: 'passed',
        calcType: 'size',
        sizeVariant: 'large',
        tariff: 'standart',
        status: 'done',
        deliveredByName: 'Abdulazizxon Abdurahmonov Abdulloh o\'g\'li',
        createdAt: DateTime(2026, 9, 1),
      ),
      OrderItem(
        id: 'i5',
        itemNumber: 5,
        name: 'Yakandoz',
        area: 0,
        price: 35000,
        qcStatus: 'pending',
        calcType: 'count',
        qty: 12,
        tariff: 'express',
        status: 'packing',
        category: 'boshqa',
        createdAt: DateTime(2026, 9, 1),
      ),
    ];

Order nastyOrder({String serviceType = 'pickup', String status = 'brought_in'}) => Order(
      id: 'o1',
      orderNumber: 12345,
      customerName: 'Abdulazizxon Abdurahmonov Abdulloh o\'g\'li (qo\'shnisi orqali)',
      phone: '+998901234567',
      location: "Toshkent sh., Yunusobod tumani, 4-mavze, 12-uy, 45-xonadon, 3-qavat, lift ishlamaydi",
      gpsCoords: '41.3601,69.2851',
      serviceType: serviceType,
      tariff: serviceType == 'onsite' ? 'express' : null,
      status: status,
      assignedTeam: const ['me'],
      createdBy: 'e',
      createdAt: DateTime(2026, 9, 1),
      totalPrice: 22790677,
      itemStatusCounts: const {'washing': 1, 'pending': 1, 'ready': 1, 'done': 1, 'packing': 1},
      notedItems: const [_longName, 'Parda', 'Yakandoz'],
      estimatedPrice: 99999999,
      prepaidAmount: 12345678,
      prepayments: [
        Prepayment(
          id: 'p1',
          amount: 12345678,
          cashAmount: 2345678,
          cardAmount: 10000000,
          at: DateTime.now(),
          employeeId: 'me',
          employeeName: 'Abdulazizxon Abdurahmonov',
          note: 'Zaklad — qolgani topshirishda, mijoz kartadan to\'laydi',
        ),
      ],
      lastCommentText: 'Lift ishlamaydi',
      lastCommentAuthor: 'Dilnoza',
      itemsMirror: nastyItems(),
    );

Future<void> pumpSheet(
  WidgetTester tester,
  void Function(BuildContext) open, {
  required Order order,
  required String department,
  double width = 320,
  double scale = 1.3,
}) async {
  // Joylashuv xatosining to'liq tafsiloti (qaysi vidjet) konsolga chiqsin.
  final original = FlutterError.onError;
  FlutterError.onError = (details) {
    FlutterError.dumpErrorToConsole(details, forceReport: true);
    original?.call(details);
  };
  addTearDown(() => FlutterError.onError = original);
  tester.view.physicalSize = Size(width * 3, 760 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        ordersProvider.overrideWithValue(AsyncData([order])),
        ordersRepositoryProvider.overrideWith(_Repo.new),
        actionQueueProvider.overrideWith(_Queue.new),
        connectivityProvider.overrideWith((ref) => Stream.value(true)),
        authStateProvider.overrideWith((ref) => const Stream.empty()),
        tariffSettingsProvider.overrideWith((ref) => Stream.value(kDefaultTariffs)),
        orderSourcesProvider.overrideWith((ref) => Stream.value(const [])),
        bonusServiceProvider.overrideWithValue(_Bonus()),
        currentEmployeeProvider.overrideWith(
          (ref) => Stream.value({
            'department': department,
            'fullName': 'Ali',
            'specializations': ['gilam'],
            'canPack': true,
            'canTakePrepayment': true,
          }),
        ),
        employeeClaimsProvider.overrideWith(
          (ref) async => EmployeeClaims(employeeId: 'me', role: department, department: department),
        ),
      ],
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(child: TextButton(onPressed: () => open(context), child: const Text('ochish'))),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('ochish'));
  await tester.pumpAndSettle();
}

/// Joylashuv xatosi bo'lsa — qaysi vidjet ekanini ham ko'rsatib yiqiladi.
void expectNoLayoutError(WidgetTester tester) {
  final error = tester.takeException();
  if (error is FlutterError) fail(error.toStringDeep());
  expect(error, isNull);
}

/// Varaqni oxirigacha aylantirib, har bir qismini quradi.
Future<void> scrollThrough(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -500));
    await tester.pumpAndSettle();
  }
}

void main() {
  for (final (width, scale) in [(320.0, 1.3), (360.0, 1.0), (412.0, 1.3)]) {
    group('${width.toInt()}px · ${scale}x', () {
      testWidgets('ItemDetailRow — har xil holatdagi mahsulotlar', (tester) async {
        tester.view.physicalSize = Size(width * 3, 1600 * 3);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [tariffSettingsProvider.overrideWith((ref) => Stream.value(kDefaultTariffs))],
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: Scaffold(
                body: ListView(
                  padding: const EdgeInsets.all(36),
                  children: [
                    for (final item in nastyItems()) ItemDetailRow(item: item, subId: item.subId(12345), editable: true),
                  ],
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expectNoLayoutError(tester);
      });

      testWidgets('Sotuv menejeri ichki kartasi', (tester) async {
        await pumpSheet(tester, (c) => openOrderDetailSheet(c, nastyOrder(status: 'new')),
            order: nastyOrder(status: 'new'), department: 'dispatcher', width: width, scale: scale);
        expectNoLayoutError(tester);
        await scrollThrough(tester);
        expectNoLayoutError(tester);
      });

      testWidgets('Dastavchik ichki kartasi', (tester) async {
        await pumpSheet(tester, (c) => openDeliveryOrderDetailSheet(c, nastyOrder()),
            order: nastyOrder(), department: 'delivery', width: width, scale: scale);
        expectNoLayoutError(tester);
        await scrollThrough(tester);
        expectNoLayoutError(tester);
      });

      testWidgets('Ishchi ichki kartasi', (tester) async {
        await pumpSheet(tester, (c) => openWorkerOrderDetailSheet(c, nastyOrder()),
            order: nastyOrder(), department: 'worker', width: width, scale: scale);
        expectNoLayoutError(tester);
        await scrollThrough(tester);
        expectNoLayoutError(tester);
      });

      testWidgets("Topshirish va to'lov oynasi", (tester) async {
        final ready = nastyItems().map((i) => i.copyWith(status: 'ready')).toList();
        await pumpSheet(tester, (c) => openDeliveryPaymentSheet(c, order: nastyOrder(), readyItems: ready),
            order: nastyOrder(), department: 'delivery', width: width, scale: scale);
        expectNoLayoutError(tester);
        await tester.enterText(find.byType(TextField).first, '1');
        await tester.pumpAndSettle();
        await scrollThrough(tester);
        expectNoLayoutError(tester);
      });

      testWidgets('Joyida yuvish jamoasi ichki kartasi', (tester) async {
        final onsite = nastyOrder(serviceType: 'onsite', status: 'in_progress');
        await pumpSheet(tester, (c) => openTeamJobDetailSheet(c, onsite),
            order: onsite, department: 'worker', width: width, scale: scale);
        expectNoLayoutError(tester);
        await scrollThrough(tester);
        expectNoLayoutError(tester);
      });
    });
  }
}

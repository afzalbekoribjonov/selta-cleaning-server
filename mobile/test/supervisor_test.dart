import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_assignment.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/photos/photo_queue.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/my_activity_repository.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/stats_repository.dart';
import 'package:selta_cleaning/core/services/supervisor_repository.dart';
import 'package:selta_cleaning/core/services/warehouse_settings.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/driver_tasks.dart';
import 'package:selta_cleaning/features/supervisor/delivery_planner_screen.dart';
import 'package:selta_cleaning/features/supervisor/delivery_planning.dart';
import 'package:selta_cleaning/features/supervisor/performer_picker_sheet.dart';
import 'package:selta_cleaning/features/supervisor/staff_detail_screen.dart';
import 'package:selta_cleaning/features/supervisor/supervisor_home_screen.dart';
import 'package:selta_cleaning/features/supervisor/supervisor_workflow.dart';

OrderItem item(String id, int n, String status, {String? category, String? washingBy}) => OrderItem(
      id: id,
      itemNumber: n,
      name: n.isEven ? 'Parda (juda uzun nomli mahsulot)' : 'Gilam',
      area: 6,
      price: 60000,
      qcStatus: 'pending',
      status: status,
      category: category,
      washingBy: washingBy,
    );

Order order(
  String id, {
  int number = 100,
  String status = 'brought_in',
  List<OrderItem> items = const [],
  OrderAssignment? assignment,
  DateTime? createdAt,
}) {
  final counts = <String, int>{};
  for (final i in items) {
    counts[i.status!] = (counts[i.status!] ?? 0) + 1;
  }
  return Order(
    id: id,
    orderNumber: number,
    customerName: 'Mijoz $id Abdurahmonov Abdulazizxon',
    phone: '+998901234567',
    location: "Yunusobod 19-kvartal, 12-uy, mo'ljal: katta supermarket yonida",
    serviceType: 'pickup',
    status: status,
    createdBy: 'd1',
    createdAt: createdAt ?? DateTime(2026, 11, 1),
    itemStatusCounts: counts,
    totalPrice: items.fold<num>(0, (s, i) => s + i.price),
    itemsMirror: items,
    assignment: assignment,
  );
}

const worker = StaffMember(
  id: 'w1',
  fullName: 'Ishchi Bir',
  department: 'worker',
  departmentLabel: 'Ishchi',
  specializations: ['gilam'],
);

final today = dateKeyOf(DateTime.now());

void main() {
  group('OrderAssignment.fromRaw', () {
    test("to'liq yozuv o'qiladi, bo'sh izoh null", () {
      final a = OrderAssignment.fromRaw({
        'driverId': 'drv',
        'driverName': 'Ali',
        'date': '2026-11-05',
        'kind': 'delivery',
        'itemIds': ['i1', 'i2'],
        'seq': 3,
        'note': '   ',
      })!;
      expect(a.driverId, 'drv');
      expect(a.itemIds, ['i1', 'i2']);
      expect(a.seq, 3);
      expect(a.note, isNull);
      expect(a.isPickup, isFalse);
    });

    test("haydovchi yoki sana bo'lmasa — null", () {
      expect(OrderAssignment.fromRaw(null), isNull);
      expect(OrderAssignment.fromRaw({'driverId': 'x'}), isNull);
      expect(OrderAssignment.fromRaw({'date': '2026-11-05'}), isNull);
    });
  });

  group('topshiriq', () {
    OrderAssignment deliver(List<String> ids, {String date = '2026-11-05', int seq = 0}) =>
        OrderAssignment(driverId: 'drv', driverName: 'Ali', date: date, kind: 'delivery', itemIds: ids, seq: seq);

    test("barcha belgilangan mahsulotlar topshirilsa — yopiladi", () {
      final open = order('a', items: [item('i1', 1, 'ready'), item('i2', 2, 'washing')], assignment: deliver(['i1']));
      final closed = order('b', items: [item('i1', 1, 'done'), item('i2', 2, 'washing')], assignment: deliver(['i1']));
      expect(isAssignmentOpen(open), isTrue);
      expect(isAssignmentOpen(closed), isFalse);
    });

    test("olib kelish — sexga kelgach yopiladi", () {
      const pickup = OrderAssignment(driverId: 'drv', driverName: 'Ali', date: '2026-11-05', kind: 'pickup');
      expect(isAssignmentOpen(order('n', status: 'new', assignment: pickup)), isTrue);
      expect(isAssignmentOpen(order('b', assignment: pickup)), isFalse);
    });

    test("dastavchik ro'yxati: kun, so'ng tartib; ertangisi hali chiqmaydi", () {
      final now = DateTime(2026, 11, 5, 10);
      final orders = [
        order('second', items: [item('i', 1, 'ready')], assignment: deliver(['i'], seq: 1)),
        order('first', items: [item('i', 1, 'ready')], assignment: deliver(['i'], seq: 0)),
        order('yesterday', items: [item('i', 1, 'ready')], assignment: deliver(['i'], date: '2026-11-04', seq: 5)),
        order('tomorrow', items: [item('i', 1, 'ready')], assignment: deliver(['i'], date: '2026-11-06')),
      ];
      expect(openAssignmentsFor(orders, 'drv', now).map((o) => o.id), ['yesterday', 'first', 'second']);
    });

    test("assignedDueOf — faqat belgilangan mahsulotlar, oldindan to'lov ayiriladi", () {
      final o = order('a', items: [item('i1', 1, 'ready'), item('i2', 2, 'ready')], assignment: deliver(['i1']));
      expect(assignedDueOf(o), 60000);
    });

    test("currentStopsFor — tayyor bo'lmay qolgan mahsulot va yopilgan buyurtma tashlanadi", () {
      final orders = [
        order('keep', items: [item('i1', 1, 'ready'), item('i2', 2, 'returned')], assignment: deliver(['i1', 'i2'], date: today)),
        order('gone', items: [item('i1', 1, 'done')], assignment: deliver(['i1'], date: today)),
      ];
      final stops = currentStopsFor(orders, 'drv', today);
      expect(stops.length, 1);
      expect(stops.single.orderId, 'keep');
      expect(stops.single.itemIds, ['i1']);
      expect(stopCountFor(orders, 'drv', today), 1);
    });

    test('planKindOf', () {
      expect(planKindOf(order('n', status: 'new')), PlanKind.pickup);
      expect(planKindOf(order('r', items: [item('i', 1, 'ready')])), PlanKind.delivery);
      expect(planKindOf(order('w', items: [item('i', 1, 'washing')])), isNull);
    });
  });

  group('jarayon', () {
    test("itemsInStage — eng eski buyurtma birinchi, faqat sexdagilar", () {
      final orders = [
        order('new', createdAt: DateTime(2026, 11, 3), items: [item('a', 1, 'washing')]),
        order('old', createdAt: DateTime(2026, 11, 1), items: [item('b', 2, 'washing'), item('c', 1, 'washing'), item('d', 3, 'ready')]),
        order('notIn', status: 'picked_up', items: [item('e', 1, 'washing')]),
      ];
      final list = itemsInStage(orders, 'washing');
      expect(list.map((w) => w.item.id), ['c', 'b', 'a']);
      expect(stageCounts(orders)['washing'], 3);
      expect(stageCounts(orders)['ready'], 1);
    });

    test("ineligibilityReason — server qoidasi bilan bir xil", () {
      final wash = kStageActions['pending']!.first;
      final pack = kStageActions['packing']!.first;
      expect(ineligibilityReason(worker, item('i', 1, 'pending', category: 'gilam'), wash), isNull);
      expect(ineligibilityReason(worker, item('i', 1, 'pending'), wash), isNull, reason: 'toifasiz mahsulot');
      expect(ineligibilityReason(worker, item('i', 1, 'pending', category: 'parda'), wash), 'Mutaxassisligi mos emas');
      expect(ineligibilityReason(worker, item('i', 1, 'packing'), pack), "Upakovka huquqi yo'q");
      const driver = StaffMember(id: 'd', fullName: 'D', department: 'delivery', departmentLabel: 'Dastavchik');
      expect(ineligibilityReason(driver, item('i', 1, 'pending'), wash), 'Ishchi emas');
      const noSpec = StaffMember(id: 'x', fullName: 'X', department: 'worker', departmentLabel: 'Ishchi');
      expect(ineligibilityReason(noSpec, item('i', 1, 'pending'), wash), 'Mutaxassislik belgilanmagan');
    });

    test("'Yuvildi' oynasida yuvishni boshlagan ishchi oldindan tanlanadi", () {
      final done = kStageActions['washing']!.first;
      expect(defaultPerformerFor(item('i', 1, 'washing', washingBy: 'w1'), done), 'w1');
      expect(defaultPerformerFor(item('i', 1, 'pending', washingBy: 'w1'), kStageActions['pending']!.first), isNull);
    });

    test('orderMatchesQuery', () {
      final o = order('q', number: 245);
      expect(orderMatchesQuery(o, ''), isTrue);
      expect(orderMatchesQuery(o, '#245'), isTrue);
      expect(orderMatchesQuery(o, '245/2'), isTrue);
      expect(orderMatchesQuery(o, '24'), isFalse, reason: 'raqam aniq mos kelishi kerak');
      expect(orderMatchesQuery(o, '4567'), isTrue, reason: 'telefon qismi');
      expect(orderMatchesQuery(o, 'yunusobod'), isTrue);
      expect(orderMatchesQuery(o, 'abdurahmonov'), isTrue);
      expect(orderMatchesQuery(o, '7'), isFalse, reason: 'bitta raqam telefonga solishtirilmaydi');
    });
  });

  group('ekranlar 360px', () {
    final staff = [
      worker,
      const StaffMember(
        id: 'w2',
        fullName: 'Juda uzun ismli ishchi Abdulazizxon Abdurahmonov',
        department: 'worker',
        departmentLabel: 'Ishchi',
        specializations: ['gilam', 'parda'],
        canPack: true,
        washed: 12,
        packed: 7,
        pendingWarnings: 2,
        attendanceStatus: 'late',
        attendanceTime: '09:42',
      ),
      const StaffMember(
        id: 'drv',
        fullName: 'Dastavchik Ali',
        department: 'delivery',
        departmentLabel: 'Dastavchik',
        delivered: 9,
        deliveredTotal: 1250000,
        pickedUp: 4,
        attendanceStatus: 'on_time',
        attendanceTime: '08:05',
      ),
    ];
    final orders = [
      order('a', number: 1201, items: [item('a1', 1, 'pending'), item('a2', 2, 'washing', washingBy: 'w2'), item('a3', 3, 'ready')]),
      order('b', number: 1202, items: [item('b1', 1, 'packing'), item('b2', 2, 'returned')]),
      order('c', number: 1203, status: 'new'),
    ];

    List<Override> overrides() => [
          ordersProvider.overrideWithValue(AsyncData(orders)),
          currentEmployeeProvider.overrideWith((ref) => Stream.value({
                'fullName': 'Nazoratchi Abdulazizxon Abdurahmonov',
                'department': 'supervisor',
                'pendingWarnings': [
                  {'id': 'w', 'text': 'Hisobotni kechiktirmang', 'byName': 'Admin'},
                ],
              })),
          employeeClaimsProvider.overrideWith(
            (ref) async => const EmployeeClaims(employeeId: 'sup', role: 'supervisor', department: 'supervisor'),
          ),
          actionQueueProvider.overrideWith(_EmptyQueue.new),
          photoQueueProvider.overrideWith(_NoPhotos.new),
          connectivityProvider.overrideWith((ref) => Stream.value(true)),
          supervisorStaffProvider.overrideWith((ref, date) async => staff),
          dailyStatsProvider.overrideWith((ref, date) async => DailyStats.fromJson({'date': date})),
          warehouseReadyDaysProvider.overrideWith((ref) => Stream.value(5)),
          staffActivityProvider.overrideWith((ref, key) async => MyDailyActivity.fromJson({'date': key.date})),
          staffWarningsProvider.overrideWith((ref, id) async => [
                WarningEntry(
                  id: 'x',
                  text: "Ish sifatiga e'tibor bering — uzun matn: mijoz gilam chetidagi dog' qolganini aytdi",
                  createdByName: 'Nazoratchi',
                  createdAt: DateTime(2026, 11, 4, 18, 30),
                ),
              ]),
        ];

    Future<void> pump(WidgetTester tester, Widget home) async {
      tester.view.physicalSize = const Size(360 * 3, 760 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(overrides: overrides(), child: MaterialApp(home: home)));
      await tester.pumpAndSettle();
    }

    testWidgets("nazoratchi paneli: to'rt bo'lim toshib ketmaydi", (tester) async {
      await pump(tester, const SupervisorHomeScreen());
      expect(tester.takeException(), isNull);
      expect(find.text('NAZORATCHI'), findsOneWidget);
      expect(find.textContaining('Hisobotni kechiktirmang'), findsOneWidget);
      // Jarayon: navbatdagi mahsulot va "Yuvishga berish".
      expect(find.text('Yuvishga berish'), findsWidgets);

      for (final tab in ['Yetkazish', 'Xodimlar', 'Buyurtmalar']) {
        await tester.tap(find.text(tab).last);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: tab);
      }
      // Xodimlar ro'yxatida o'zi yo'q, kechikkani ko'rinadi.
      await tester.tap(find.text('Xodimlar').last);
      await tester.pumpAndSettle();
      expect(find.text('Kechikdi 09:42'), findsOneWidget);
    });

    testWidgets("jarayon bosqichlari bo'ylab o'tish", (tester) async {
      await pump(tester, const SupervisorHomeScreen());
      for (final stage in kWorkflowStages) {
        await tester.ensureVisible(find.text(stage.label).first);
        await tester.pumpAndSettle();
        await tester.tap(find.text(stage.label).first);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: stage.key);
      }
    });

    testWidgets("topshiriq tuzish: mahsulot tanlash va pastki panel", (tester) async {
      await pump(tester, DeliveryPlannerScreen(driver: staff[2], date: today));
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Mijoz a'), findsOneWidget);
      expect(find.text('Hech narsa tanlanmagan'), findsOneWidget);
      await tester.tap(find.textContaining('Mijoz a'));
      await tester.pumpAndSettle();
      expect(find.text('1 ta buyurtma · 1 ta mahsulot'), findsOneWidget);
      // Mahsulotlar ochiladi — faqat tayyori ro'yxatda.
      await tester.tap(find.byTooltip('Mahsulotlar'));
      await tester.pumpAndSettle();
      expect(find.byType(CheckboxListTile), findsOneWidget);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pumpAndSettle();
      expect(find.text('Hech narsa tanlanmagan'), findsOneWidget);
      // Olib kelish bo'limi.
      await tester.tap(find.text('Olib kelish'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Mijoz c'), findsOneWidget);
    });

    testWidgets("'Kim yuvdi?' oynasi: mos kelmaydigan ishchi sababi bilan", (tester) async {
      final work = WorkItem(orders[0], item('px', 2, 'washing', category: 'parda', washingBy: 'w2'));
      await pump(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => openPerformerPicker(context, work: work, action: kStageActions['washing']!.first),
                child: const Text('ochish'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('ochish'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Kim yuvdi?'), findsOneWidget);
      // Parda — "Ishchi Bir" faqat gilam yuvadi.
      expect(find.text('Mutaxassisligi mos emas'), findsOneWidget);
      // Faqat ishchilar ro'yxatda; yuvishni boshlagani oldindan tanlangan va tepada.
      expect(find.text('Dastavchik Ali'), findsNothing);
      final eligible = tester.getTopLeft(find.textContaining('Abdulazizxon')).dy;
      final other = tester.getTopLeft(find.text('Ishchi Bir')).dy;
      expect(eligible, lessThan(other));
    });

    testWidgets("xodim sahifasi: ish, ogohlantirishlar, tugma", (tester) async {
      await pump(tester, StaffDetailScreen(member: staff[1], initialDay: DateTime.now()));
      expect(tester.takeException(), isNull);
      expect(find.text('Ogohlantirish berish'), findsOneWidget);
      await tester.scrollUntilVisible(find.textContaining('Ish sifatiga'), 200);
      expect(find.text("Ko'rmadi"), findsOneWidget);
      await tester.tap(find.text('Ogohlantirish berish'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Yuborish'), findsOneWidget);
    });
  });
}

class _EmptyQueue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

class _NoPhotos extends PhotoQueue {
  @override
  List<PhotoOp> build() => const [];
}

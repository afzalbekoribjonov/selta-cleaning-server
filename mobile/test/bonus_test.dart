import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/bonus_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/delivery/delivery_payment_sheet.dart';
import 'package:selta_cleaning/features/shared/bonus_section.dart';

class _EmptyQueue extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

class _FakeBonus implements BonusService {
  num balance;
  final applied = <(String, num?)>[];
  final cancelled = <String>[];
  int fetches = 0;
  bool offline = false;

  _FakeBonus(this.balance);

  @override
  Future<CustomerBonus> fetch(String phone) async {
    fetches++;
    if (offline) throw Exception('internet yo\'q');
    return CustomerBonus(balance: balance, earnedTotal: 5000, spentTotal: 0, percent: 1);
  }

  @override
  Future<num> apply({required String orderId, num? amount, String? actorName}) async {
    applied.add((orderId, amount));
    final use = amount == null || amount > balance ? balance : amount;
    balance -= use;
    return use;
  }

  @override
  Future<void> cancel({required String orderId, required String entryId}) async => cancelled.add(entryId);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeRepo extends OrdersRepository {
  final List<num> paid;
  _FakeRepo(super.ref, this.paid);

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
  }) async {
    paid.add(paidAmount);
  }
}

Order sample({
  String status = 'brought_in',
  String serviceType = 'pickup',
  num total = 100000,
  num prepaid = 0,
  num bonus = 0,
  num? earned,
  List<BonusUse> entries = const [],
  List<String> team = const [],
}) =>
    Order(
      id: 'o1',
      orderNumber: 1245,
      customerName: 'Aziz Karimov',
      phone: '+998901234567',
      location: 'Yunusobod',
      serviceType: serviceType,
      status: status,
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      totalPrice: total,
      prepaidAmount: prepaid,
      bonusAmount: bonus,
      bonusEarned: earned,
      bonusEntries: entries,
      assignedTeam: team,
      itemStatusCounts: const {'ready': 1},
    );

List<Override> _overrides(_FakeBonus bonus, {required String role, Map<String, dynamic> employee = const {}, List<num>? paid}) => [
      bonusServiceProvider.overrideWithValue(bonus),
      employeeClaimsProvider.overrideWith((ref) async => EmployeeClaims(employeeId: 'me', role: role, department: role)),
      currentEmployeeProvider.overrideWith((ref) => Stream.value({'fullName': 'Ali', ...employee})),
      actionQueueProvider.overrideWith(_EmptyQueue.new),
      if (paid != null) ordersRepositoryProvider.overrideWith((ref) => _FakeRepo(ref, paid)),
    ];

Future<void> _pumpSection(
  WidgetTester tester,
  Order order,
  _FakeBonus bonus, {
  String role = 'delivery',
  Map<String, dynamic> employee = const {},
  double width = 360,
  double scale = 1,
}) async {
  tester.view.physicalSize = Size(width * 3, 1400 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: _overrides(bonus, role: role, employee: employee),
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(body: ListView(padding: const EdgeInsets.all(20), children: [BonusSection(order: order)])),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test('kredit oldindan to\'lov va bonusdan iborat', () {
    final o = sample(total: 100000, prepaid: 30000, bonus: 2000);
    expect(o.prepaidCredit, 32000);
    expect(o.remainingToPay, 68000);
    expect(bonusPhoneKey('+998 90 123 45 67'), '901234567');
    expect(bonusPhoneKey('12345'), isNull);
  });

  test('ishlata oladiganlar — server qoidasi bilan bir xil', () {
    EmployeeClaims c(String role) => EmployeeClaims(employeeId: 'me', role: role, department: role);
    final pickup = sample();
    expect(canApplyBonus(const {}, c('delivery'), pickup), isTrue);
    expect(canApplyBonus(const {}, c('dispatcher'), pickup), isTrue);
    expect(canApplyBonus(const {}, c('worker'), pickup), isFalse);
    expect(canApplyBonus(const {'canAccessWarehouse': true}, c('worker'), pickup), isTrue);
    expect(canApplyBonus(const {}, c('worker'), sample(serviceType: 'onsite', team: ['me'])), isTrue);
  });

  group('BonusSection', () {
    testWidgets("bonusi yo'q mijozda bo'lim chiqmaydi", (tester) async {
      await _pumpSection(tester, sample(), _FakeBonus(0));
      expect(find.text('Bonus (keshbek)'), findsNothing);
    });

    testWidgets("vakolatsiz ishchi uchun hisob so'ralmaydi", (tester) async {
      final bonus = _FakeBonus(5000);
      await _pumpSection(tester, sample(), bonus, role: 'worker');
      expect(bonus.fetches, 0);
      expect(find.text('Bonus (keshbek)'), findsNothing);
    });

    testWidgets("bonusni ishlatish: tasdiq, so'rov va hisob yangilanadi", (tester) async {
      final bonus = _FakeBonus(5000);
      await _pumpSection(tester, sample(), bonus);
      expect(find.text("5 000 so'm"), findsOneWidget);
      await tester.tap(find.text('Bonusni ishlatish'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ishlatish'));
      await tester.pumpAndSettle();
      expect(bonus.applied.single, ('o1', null));
      expect(find.textContaining("Bonusdan 5 000 so'm ayirildi"), findsOneWidget);
      expect(bonus.fetches, 2, reason: 'hisob qayta olindi');
      expect(find.text('Bonusni ishlatish'), findsNothing, reason: 'bonus tugadi');
    });

    testWidgets('narxi aniqlanmagan buyurtmada tugma o\'chiq', (tester) async {
      await _pumpSection(tester, sample(total: 0), _FakeBonus(5000));
      final button = tester.widget<ButtonStyleButton>(find.ancestor(of: find.text('Narx aniqlangach ishlatiladi'), matching: find.byWidgetPredicate((w) => w is ButtonStyleButton)));
      expect(button.onPressed, isNull);
    });

    testWidgets("qo'llangan bonus va berilgan keshbek — hammaga ko'rinadi, o'zinikini qaytarish mumkin", (tester) async {
      final bonus = _FakeBonus(0);
      await _pumpSection(
        tester,
        sample(bonus: 3000, entries: [
          BonusUse(id: 'b1', amount: 3000, at: DateTime(2026, 10, 5), employeeId: 'me', employeeName: 'Ali'),
          BonusUse(id: 'b2', amount: 1000, at: DateTime(2026, 10, 5), employeeId: 'other'),
        ]),
        bonus,
      );
      expect(find.text("-3 000 so'm"), findsOneWidget);
      expect(find.byTooltip('Bonusni qaytarish'), findsOneWidget, reason: 'faqat o\'zi qo\'llagani');
      await tester.tap(find.byTooltip('Bonusni qaytarish'));
      await tester.pumpAndSettle();
      expect(bonus.cancelled, ['b1']);

      await _pumpSection(tester, sample(status: 'done', earned: 990), _FakeBonus(0), role: 'worker');
      expect(find.text("+990 so'm"), findsOneWidget);
    });

    testWidgets("internet yo'q — ogohlantirish, ilova yiqilmaydi", (tester) async {
      await _pumpSection(tester, sample(), _FakeBonus(5000)..offline = true);
      expect(find.textContaining('internet kerak'), findsOneWidget);
    });

    testWidgets('kichik ekran va katta shriftda toshmaydi', (tester) async {
      await _pumpSection(
        tester,
        sample(bonus: 123456789, earned: 98765432, entries: [
          BonusUse(id: 'b1', amount: 123456789, at: DateTime(2026, 10, 5), employeeId: 'me', employeeName: 'Abdulazizxon Abdurahmonov'),
        ]),
        _FakeBonus(99999999),
        width: 320,
        scale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group("To'lov oynasida bonus", () {
    testWidgets("bonus ishlatilsa to'lanadigan summa kamayadi", (tester) async {
      tester.view.physicalSize = const Size(360 * 3, 1600 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final bonus = _FakeBonus(5000);
      final paid = <num>[];
      final item = OrderItem(id: 'i1', itemNumber: 1, name: 'Gilam', area: 0, price: 100000, qcStatus: 'pending', status: 'ready');
      await tester.pumpWidget(
        ProviderScope(
          overrides: _overrides(bonus, role: 'delivery', paid: paid),
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => openDeliveryPaymentSheet(context, order: sample(), readyItems: [item]),
                  child: const Text('ochish'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('ochish'));
      await tester.pumpAndSettle();

      expect(find.text("Bonusni ishlatish · 5 000 so'm"), findsOneWidget);
      await tester.tap(find.text("Bonusni ishlatish · 5 000 so'm"));
      await tester.pumpAndSettle();
      expect(bonus.applied.single, ('o1', 5000));
      expect(find.text('Bonusdan'), findsOneWidget);
      expect(find.text("95 000 so'm"), findsOneWidget);
      expect(find.textContaining('Bonusni ishlatish'), findsNothing);

      await tester.tap(find.text("To'liq summani kiritish"));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.textContaining('Topshirish ('));
      await tester.tap(find.textContaining('Topshirish ('));
      await tester.pumpAndSettle();
      expect(paid.single, 95000);
      expect(tester.takeException(), isNull);
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/expenses_repository.dart';
import 'package:selta_cleaning/core/services/my_activity_repository.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/warehouse_settings.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/expenses/expenses_screen.dart';
import 'package:selta_cleaning/features/profile/today_activity_section.dart';
import 'package:selta_cleaning/features/shared/employee_app_bar.dart';

/// Navbat — yubormaydi, faqat yozib boradi.
class _RecordingQueue extends ActionQueue {
  final List<PendingAction> initial;
  _RecordingQueue([this.initial = const []]);

  @override
  List<PendingAction> build() => initial;

  @override
  void enqueue(PendingAction action) => state = [...state, action];

  @override
  void discard(String actionId) => state = state.where((a) => a.id != actionId).toList();

  void ack(String id) => state = [for (final a in state) a.id == id ? a.copyWith(acked: true) : a];
}

PendingAction pendingExpense(String id, {String name = "Yoqilg'i", num amount = 50000, bool fromCash = true, bool failed = false}) =>
    PendingAction(
      id: id,
      path: kAddExpensePath,
      body: {'expenseId': id, 'name': name, 'amount': amount, 'fromCash': fromCash, 'actionId': id},
      effect: const {'kind': 'expense.add'},
      label: 'Chiqim · $name',
      createdAt: DateTime(2026, 10, 5, 15),
      failed: failed,
      error: failed ? 'Summa noto\'g\'ri' : null,
    );

Map<String, dynamic> activityJson({num collected = 300000, List<Map<String, dynamic>> expenses = const []}) => {
      'date': '2026-10-05',
      'payments': {'cash': collected, 'collectedCash': collected, 'rows': const []},
      'expenses': {'rows': expenses},
    };

Map<String, dynamic> serverExpense(String id, {String name = 'Texnik xizmat', num amount = 30000, bool fromCash = false}) =>
    {'id': id, 'name': name, 'amount': amount, 'fromCash': fromCash, 'note': 'Damas', 'at': '2026-10-05T09:30:00.000Z'};

void main() {
  group('mergeExpenses / cashInHand', () {
    test("navbatdagilar qo'shiladi, serverdagisi takrorlanmaydi, yangisi birinchi", () {
      final server = [ExpenseEntry.fromMap(serverExpense('a'))];
      final merged = mergeExpenses(server, [pendingExpense('a'), pendingExpense('b')]);
      expect(merged.map((e) => e.id), ['b', 'a']);
      expect(merged.first.pending, isTrue);
      expect(merged.last.pending, isFalse);
    });

    test("rad etilgan chiqim naqdni kamaytirmaydi, naqdsiz chiqim ham", () {
      final expenses = mergeExpenses(
        [ExpenseEntry.fromMap(serverExpense('s', amount: 30000))],
        [pendingExpense('ok', amount: 50000), pendingExpense('bad', amount: 70000, failed: true)],
      );
      final cash = cashInHand(300000, expenses);
      expect((cash.collected, cash.cashExpenses, cash.inHand), (300000, 50000, 250000));
      expect(expenses.firstWhere((e) => e.id == 'bad').failed, isTrue);
    });

    test('eski kesh nusxasida collectedCash yo\'q — cash olinadi', () {
      final a = MyDailyActivity.fromJson({
        'payments': {'cash': 120000},
      });
      expect(a.collectedCash, 120000);
      expect(a.expenses, isEmpty);
    });
  });

  test('add — navbatga to\'g\'ri tanada qo\'yiladi (ID = amal ID)', () {
    final queue = _RecordingQueue();
    final container = ProviderContainer(overrides: [actionQueueProvider.overrideWith(() => queue)]);
    addTearDown(container.dispose);
    container.read(actionQueueProvider);

    container.read(expensesRepositoryProvider).add(name: "Yoqilg'i", amount: 45000, fromCash: true, note: '');
    final a = container.read(actionQueueProvider).single;
    expect(a.path, '/addExpense');
    expect(a.body['expenseId'], a.id);
    expect(a.body['actionId'], a.id);
    expect(a.body, containsPair('fromCash', true));
    expect(a.body.containsKey('note'), isFalse, reason: "bo'sh izoh yuborilmaydi");
  });

  group('ExpensesScreen', () {
    Future<({_RecordingQueue queue, int Function() fetches})> pumpScreen(
      WidgetTester tester, {
      double width = 360,
      double scale = 1,
      List<PendingAction> queued = const [],
      Map<String, dynamic>? json,
    }) async {
      tester.view.physicalSize = Size(width * 3, 800 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final queue = _RecordingQueue(queued);
      var fetches = 0;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            actionQueueProvider.overrideWith(() => queue),
            myDailyActivityProvider.overrideWith((ref) async {
              fetches++;
              return MyDailyActivity.fromJson(json ?? activityJson(expenses: [serverExpense('s1')]));
            }),
          ],
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: const ExpensesScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return (queue: queue, fetches: () => fetches);
    }

    testWidgets("ro'yxat va xulosa, kichik ekran va katta shriftda toshmaydi", (tester) async {
      await pumpScreen(
        tester,
        width: 320,
        scale: 1.3,
        queued: [pendingExpense('p1', name: 'Juda uzun nomli chiqim: avtoturargoh va yuvish', amount: 12345678)],
      );
      expect(tester.takeException(), isNull);
      expect(find.text('Texnik xizmat'), findsOneWidget);
      expect(find.text('Yuborilmoqda'), findsOneWidget);
      expect(find.text('Naqddan'), findsOneWidget);
      expect(find.text('Sizga qaytariladi'), findsOneWidget, reason: "300 000 yig'ilgan, 12 345 678 naqddan chiqim");
    });

    testWidgets("qo'shish: tur, summa, naqddan — navbatga tushadi va ro'yxatda chiqadi", (tester) async {
      final (:queue, fetches: _) = await pumpScreen(tester);
      await tester.tap(find.text("Chiqim qo'shish"));
      await tester.pumpAndSettle();

      // Tur tanlanmagan — saqlanmaydi.
      await tester.tap(find.text('SAQLASH'));
      await tester.pump();
      expect(find.text('Chiqim turini tanlang'), findsOneWidget);

      await tester.tap(find.text("Yoqilg'i"));
      await tester.enterText(find.byType(TextField).first, '50000');
      await tester.pump();
      expect(find.text("50 000 so'm"), findsOneWidget, reason: 'summa o\'qilishi oson ko\'rinishda');
      await tester.tap(find.byType(Switch));
      await tester.pump();
      await tester.ensureVisible(find.text('SAQLASH'));
      await tester.tap(find.text('SAQLASH'));
      await tester.pumpAndSettle();

      final action = queue.state.single;
      expect(action.body['name'], "Yoqilg'i");
      expect(action.body['amount'], 50000);
      expect(action.body['fromCash'], isTrue);
      expect(find.text('Yuborilmoqda'), findsOneWidget);
      expect(find.text('Topshirasiz'), findsOneWidget);
      expect(find.text("250 000 so'm"), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets("yuborilmagan chiqimni o'chirish navbatdan oladi", (tester) async {
      final (:queue, fetches: _) = await pumpScreen(tester, queued: [pendingExpense('p1')]);
      await tester.tap(find.byTooltip("O'chirish").first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, "O'chirish"));
      await tester.pumpAndSettle();
      expect(queue.state, isEmpty);
    });

    testWidgets("server qabul qilgach ro'yxat qayta so'raladi", (tester) async {
      final (:queue, :fetches) = await pumpScreen(tester, queued: [pendingExpense('p1')]);
      expect(fetches(), 1);
      queue.ack('p1');
      await tester.pumpAndSettle();
      expect(fetches(), 2, reason: 'myDailyActivity qayta olindi');
      // Tasdiqlangan amal ro'yxatda bir marta qoladi (takrorlanmaydi).
      expect(find.text("Yoqilg'i"), findsOneWidget);
    });
  });

  group('Profil pul xulosasi', () {
    Future<void> pumpProfile(WidgetTester tester, String department, Map<String, dynamic> json) async {
      tester.view.physicalSize = const Size(320 * 3, 1400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            actionQueueProvider.overrideWith(() => _RecordingQueue()),
            myDailyActivityProvider.overrideWith((ref) async => MyDailyActivity.fromJson(json)),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: TodayActivitySection(departmentKey: department, canCreateOrders: false),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets("pulsiz ishchida ko'rinmaydi", (tester) async {
      await pumpProfile(tester, 'worker', activityJson(collected: 0));
      expect(find.textContaining("Qo'lingizda"), findsNothing);
    });

    testWidgets("chiqim kiritgan ishchida naqd va chiqim ko'rinadi", (tester) async {
      await pumpProfile(
        tester,
        'worker',
        activityJson(collected: 0, expenses: [serverExpense('s', amount: 40000, fromCash: true)]),
      );
      expect(find.text('Naqddan chiqim'), findsOneWidget);
      expect(find.text('Sizga qaytariladi'), findsOneWidget);
      expect(find.text("Chiqimlarni ko'rish (1)"), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets("oldindan to'lov qabul qilgan sotuv menejerida yig'ilgan pul ko'rinadi", (tester) async {
      await pumpProfile(tester, 'dispatcher', {
        'payments': {
          'cash': 70000,
          'collectedCash': 70000,
          'prepaid': {'count': 1, 'amount': 100000},
          'rows': const [],
        },
      });
      expect(find.text("Oldindan to'lov (1)"), findsOneWidget);
      expect(find.text("Qo'lingizda"), findsOneWidget);
      expect(find.text("70 000 so'm"), findsOneWidget, reason: '30 000 karta bilan — qo\'lda faqat naqd');
    });

    testWidgets("dastavchikda chiqimsiz — avvalgidek \"Qo'lingizda\"", (tester) async {
      await pumpProfile(tester, 'delivery', activityJson(collected: 300000));
      expect(find.text("Qo'lingizda"), findsOneWidget);
      expect(find.text("300 000 so'm"), findsOneWidget);
      expect(find.text('Naqddan chiqim'), findsNothing);
    });
  });

  testWidgets('⋮ menyu: "Chiqimlar" faqat vakolat bilan', (tester) async {
    Future<List<String>> items(Map<String, dynamic> employee) async {
      await tester.pumpWidget(
        ProviderScope(
          // Har safar yangi konteyner — xodim profili boshqacha.
          key: UniqueKey(),
          overrides: [
            ordersProvider.overrideWithValue(const AsyncData([])),
            currentEmployeeProvider.overrideWith((ref) => Stream.value(employee)),
            warehouseThresholdProvider.overrideWith((ref) => Stream.value(10)),
            actionQueueProvider.overrideWith(() => _RecordingQueue()),
            connectivityProvider.overrideWith((ref) => Stream.value(true)),
          ],
          child: const MaterialApp(
            home: Scaffold(appBar: EmployeeAppBar(departmentLabel: 'Dastavchik', employeeName: 'Test')),
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
      await tester.tapAt(const Offset(5, 500));
      await tester.pumpAndSettle();
      return result;
    }

    expect(await items({'department': 'delivery'}), isNot(contains('Chiqimlar')));
    expect(await items({'department': 'delivery', 'canAddExpenses': true}), contains('Chiqimlar'));
  });
}

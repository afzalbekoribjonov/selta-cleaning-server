import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/services/api_client.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/services/stats_repository.dart';
import 'package:selta_cleaning/features/stats/daily_stats_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// So'ralgan kunlarni yozib boradigan soxta server.
class _Repo extends StatsRepository {
  final requested = <String?>[];
  _Repo() : super(ApiClient());

  @override
  Future<Map<String, dynamic>> fetchDailyStatsRaw({String? date}) async {
    requested.add(date);
    final isToday = date == dateKeyOf(DateTime.now());
    return {
      'date': date,
      'isToday': isToday,
      'broughtInToday': {'count': isToday ? 3 : 7, 'orders': const []},
      'washedToday': {'count': 0, 'totals': const [], 'items': const []},
      'deliveredToday': {'count': 0, 'orders': const []},
      'cashToHandOver': {'total': 123456789, 'entries': const []},
      'washingNow': {'count': 0, 'orderCount': 0, 'orders': const []},
      'readyToDeliver': {'count': 0, 'orderCount': 0, 'orders': const []},
      'unmeasured': {'count': 0, 'orders': const []},
    };
  }
}

void main() {
  late _Repo repo;

  Future<void> pump(WidgetTester tester, {double width = 360, double scale = 1}) async {
    SharedPreferences.setMockInitialValues({});
    final store = LocalStore(await SharedPreferences.getInstance());
    repo = _Repo();
    tester.view.physicalSize = Size(width * 3, 900 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          statsRepositoryProvider.overrideWithValue(repo),
          localStoreProvider.overrideWithValue(store),
          authStateProvider.overrideWith((ref) => const Stream.empty()),
          employeeClaimsProvider.overrideWith(
            (ref) async => const EmployeeClaims(employeeId: 'e1', role: 'worker', department: 'worker'),
          ),
        ],
        child: MaterialApp(
          locale: const Locale('uz'),
          supportedLocales: const [Locale('uz')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: const DailyStatsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets("bugun ochiladi, 'joriy holat' bor, keyingi kun tugmasi o'chiq", (tester) async {
    await pump(tester);
    expect(repo.requested.single, dateKeyOf(DateTime.now()));
    expect(find.text('Bugun'), findsOneWidget);
    expect(find.text('JORIY HOLAT'), findsOneWidget);
    expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.chevron_right_rounded)).onPressed, isNull);
  });

  testWidgets("oldingi kun: kechagi sana so'raladi, 'joriy holat' yo'q", (tester) async {
    await pump(tester);
    await tester.tap(find.byTooltip('Oldingi kun'));
    await tester.pumpAndSettle();
    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    expect(repo.requested.last, dateKeyOf(yesterday));
    expect(find.text('Kecha'), findsOneWidget);
    expect(find.text('JORIY HOLAT'), findsNothing);
    expect(find.text('Sexga keldi'), findsOneWidget);
    expect(find.text('7 ta buyurtma'), findsOneWidget);

    await tester.tap(find.byTooltip('Keyingi kun'));
    await tester.pumpAndSettle();
    expect(find.text('Bugun'), findsOneWidget);
  });

  testWidgets("kalendar o'zbekcha ochiladi", (tester) async {
    await pump(tester);
    await tester.tap(find.text('Bugun'));
    await tester.pumpAndSettle();
    expect(find.text('Kunni tanlang'), findsOneWidget);
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });

  testWidgets('kichik ekran va katta shriftda toshmaydi', (tester) async {
    await pump(tester, width: 320, scale: 1.3);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byTooltip('Oldingi kun'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  test("dateKeyOf — nol bilan to'ldiriladi", () {
    expect(dateKeyOf(DateTime(2026, 1, 5)), '2026-01-05');
    expect(dayLabelUz(DateTime(2025, 3, 4)), '4-mart, 2025');
  });
}

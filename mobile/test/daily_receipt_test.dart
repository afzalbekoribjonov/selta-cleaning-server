import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/printing/printer_service.dart';
import 'package:selta_cleaning/core/printing/receipt.dart';
import 'package:selta_cleaning/core/services/api_client.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/services/stats_repository.dart' show dateKeyOf;
import 'package:selta_cleaning/core/sync/action_queue.dart' show idTokenProvider;
import 'package:selta_cleaning/features/printing/daily_report_receipt_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Server o'rnida: so'ralgan kunni yozadi, tayyor bloklarni qaytaradi.
class _Api extends ApiClient {
  final requests = <Map<String, dynamic>>[];
  bool fail = false;

  @override
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body, String? idToken}) async {
    requests.add({'path': path, ...?body});
    if (fail) throw const ApiException(0, 'unavailable', "Serverga ulanib bo'lmadi");
    return {
      'blocks': [
        {'kind': 'logo'},
        {'kind': 'text', 'text': 'SELTA CLEANING', 'align': 'center', 'bold': true, 'large': true},
        {'kind': 'text', 'text': 'KUNLIK HISOBOT', 'align': 'center', 'bold': true},
        {'kind': 'divider', 'char': '='},
        {'kind': 'pair', 'left': 'Sana:', 'right': body?['date'], 'bold': true},
        {'kind': 'text', 'text': 'Abdulazizxon Abdurahmonov Abdulloh o\'g\'li', 'bold': true},
        {'kind': 'pair', 'left': '  Yuvdi:', 'right': '145.7 m2, 12 dona, 3.5 kg'},
        {'kind': 'pair', 'left': 'Topshirilishi kerak:', 'right': "12 345 678 so'm", 'bold': true},
        {'kind': 'unknown'},
      ],
    };
  }
}

void main() {
  test("bloklardan chek: turlar, noma'lumi tashlanadi, uzun matn kesiladi", () {
    final r = Receipt.fromBlocks([
      {'kind': 'logo'},
      {'kind': 'text', 'text': 'A' * 500, 'align': 'center', 'large': true},
      {'kind': 'pair', 'left': 'Naqd:', 'right': "100 so'm", 'bold': true},
      {'kind': 'divider', 'char': '=='},
      {'kind': 'hack', 'text': 'x'},
      'buzilgan',
    ]);
    expect(r.lines, hasLength(4));
    expect(r.lines[0], isA<ReceiptLogo>());
    expect((r.lines[1] as ReceiptText).text.length, 200);
    expect((r.lines[1] as ReceiptText).align, ReceiptAlign.center);
    expect((r.lines[2] as ReceiptPair).bold, isTrue);
    expect((r.lines[3] as ReceiptDivider).char, '=');
  });

  group('Kunlik hisobot cheki ekrani', () {
    late _Api api;

    Future<void> pump(WidgetTester tester, {double width = 360, double scale = 1}) async {
      SharedPreferences.setMockInitialValues({});
      final store = LocalStore(await SharedPreferences.getInstance());
      api = _Api();
      tester.view.physicalSize = Size(width * 3, 900 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(api),
            idTokenProvider.overrideWithValue(() async => 'token'),
            localStoreProvider.overrideWithValue(store),
            authStateProvider.overrideWith((ref) => const Stream.empty()),
            employeeClaimsProvider.overrideWith(
              (ref) async => const EmployeeClaims(employeeId: 'e', role: 'dispatcher', department: 'dispatcher'),
            ),
            currentEmployeeProvider.overrideWith((ref) => Stream.value({'canPrintDailyReport': true})),
            printerPortProvider.overrideWithValue(_NoPort()),
          ],
          child: MaterialApp(
            locale: const Locale('uz'),
            supportedLocales: const [Locale('uz')],
            localizationsDelegates: GlobalMaterialLocalizations.delegates,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: const DailyReportReceiptScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets("bugungi kun so'raladi va chek ko'rinadi; kecha — o'sha sana", (tester) async {
      await pump(tester);
      expect(api.requests.single, {'path': '/dailyReceiptReport', 'date': dateKeyOf(DateTime.now())});
      expect(find.textContaining('KUNLIK HISOBOT'), findsOneWidget);
      expect(find.textContaining('Topshirilishi kerak:'), findsOneWidget);
      expect(find.text('CHOP ETISH'), findsOneWidget);

      await tester.tap(find.byTooltip('Oldingi kun'));
      await tester.pumpAndSettle();
      expect(api.requests.last['date'], dateKeyOf(DateTime.now().subtract(const Duration(days: 1))));
    });

    testWidgets("internet yo'q — tushunarli xabar va qayta urinish", (tester) async {
      await pump(tester);
      api.fail = true;
      await tester.tap(find.byTooltip('Oldingi kun'));
      await tester.pumpAndSettle();
      expect(find.textContaining("Serverga ulanib bo'lmadi"), findsOneWidget);
      expect(find.text('Qayta urinish'), findsOneWidget);
    });

    testWidgets('kichik ekran va katta shriftda toshmaydi', (tester) async {
      await pump(tester, width: 320, scale: 1.3);
      expect(tester.takeException(), isNull);
    });
  });

  test('vakolat: admin yoki canPrintDailyReport', () {
    expect(canPrintDailyReport(const {}, 'admin'), isTrue);
    expect(canPrintDailyReport(const {'canPrintDailyReport': true}, 'worker'), isTrue);
    expect(canPrintDailyReport(const {}, 'dispatcher'), isFalse);
  });
}

class _NoPort implements PrinterPort {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

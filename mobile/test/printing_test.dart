import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/printing/escpos_encoder.dart';
import 'package:selta_cleaning/core/printing/printer_service.dart';
import 'package:selta_cleaning/core/printing/receipt.dart';
import 'package:selta_cleaning/core/printing/receipt_settings.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/services/tariff_settings.dart';
import 'package:selta_cleaning/features/printing/order_receipt.dart';
import 'package:selta_cleaning/features/printing/print_receipt_button.dart';
import 'package:selta_cleaning/features/printing/printer_settings_screen.dart';
import 'package:selta_cleaning/features/printing/receipt_preview_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Printer o'rnida — nima bo'lganini yozib boradi.
class _FakePort implements PrinterPort {
  PrintException? permission;
  bool bluetoothOn = true;
  bool connectOk = true;
  int failWrites = 0;
  final connects = <String>[];
  int disconnects = 0;
  final writes = <List<int>>[];
  List<PrinterDevice> devices = const [PrinterDevice(name: 'MPT-II', mac: 'AA:BB')];

  @override
  Future<PrintException?> ensurePermission() async => permission;
  @override
  Future<bool> isBluetoothOn() async => bluetoothOn;
  @override
  Future<List<PrinterDevice>> paired() async => devices;
  @override
  Future<bool> connect(String mac) async {
    connects.add(mac);
    return connectOk;
  }

  @override
  Future<void> disconnect() async => disconnects++;
  @override
  Future<bool> write(List<int> bytes) async {
    if (failWrites > 0) {
      failWrites--;
      return false;
    }
    writes.add(bytes);
    return true;
  }
}

OrderItem item(int n, {String status = 'done', num price = 360000, String? tariff = 'express'}) => OrderItem(
      id: 'i$n',
      itemNumber: n,
      name: n == 1 ? "Gilam (qo'lda to'qilgan, mehmonxona)" : 'Parda',
      area: 12,
      price: price,
      qcStatus: 'passed',
      calcType: n == 1 ? 'sqm' : 'count',
      qty: n == 1 ? 12 : 2,
      width: n == 1 ? 3 : null,
      height: n == 1 ? 4 : null,
      tariff: tariff,
      status: status,
    );

Order order({
  String status = 'done',
  num total = 440000,
  num? paid = 440000,
  num prepaid = 0,
  num bonus = 0,
  num discount = 0,
  num debt = 0,
}) =>
    Order(
      id: 'o1',
      orderNumber: 1245,
      customerName: 'Aziz Karimov',
      phone: '+998901234567',
      location: 'Yunusobod 4-12',
      serviceType: 'pickup',
      status: status,
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      totalPrice: total,
      paidTotal: paid,
      prepaidAmount: prepaid,
      bonusAmount: bonus,
      discountTotal: discount,
      debtTotal: debt,
    );

String text(Receipt r, [PaperWidth p = PaperWidth.mm58]) => layoutReceipt(r, p).map((l) => l.text).join('\n');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Joylashtirish', () {
    test("ASCII: maxsus belgilar oddiyga, noma'lumi '?'", () {
      expect(receiptAscii("Oʻzbek ‘gʼ’ 3×4 m² — 1·2 «x» …"), "O'zbek 'g'' 3x4 m2 - 1|2 \"x\" ...");
      expect(receiptAscii('Привет'), '??????');
    });

    test("so'z bo'yicha bo'linadi, juda uzun so'z kesiladi", () {
      expect(wrapText('salom dunyo bugun', 11), ['salom dunyo', 'bugun']);
      expect(wrapText('a' * 25, 10), ['a' * 10, 'a' * 10, 'a' * 5]);
    });

    test('har qator qog\'oz enidan oshmaydi, juftlik o\'ngga tekislanadi', () {
      final r = Receipt([
        const ReceiptPair('Jami:', "440 000 so'm"),
        ReceiptPair('Juda uzun nom ${'x' * 40}', "12 345 678 so'm"),
        const ReceiptText('SELTA', align: ReceiptAlign.center, large: true),
        const ReceiptDivider(),
      ]);
      for (final p in PaperWidth.values) {
        final lines = layoutReceipt(r, p);
        for (final l in lines) {
          expect(l.text.length, lessThanOrEqualTo(l.large ? p.chars ~/ 2 : p.chars), reason: l.text);
        }
        expect(lines.first.text.endsWith("440 000 so'm") && lines.first.text.startsWith('Jami:'), isTrue);
        expect(lines.first.text.length, p.chars);
      }
      expect(layoutReceipt(r, PaperWidth.mm58).last.text, '-' * 32);
    });
  });

  group('Buyurtma cheki', () {
    const s = ReceiptSettings(headerLines: ['Tel: +998 90 000 00 00']);
    Receipt build(Order o, [List<OrderItem>? items]) =>
        buildOrderReceipt(order: o, items: items ?? [item(1), item(2, price: 80000)], settings: s, now: DateTime(2026, 10, 6, 14, 5), cashier: 'Ali');

    test("yetkazilgan, to'liq to'langan", () {
      final t = text(build(order()));
      expect(t, contains('SELTA'));
      expect(t, contains('Tel: +998 90 000 00 00'));
      expect(t, contains('Buyurtma #1245'));
      expect(t, contains('06.10.2026 14:05'));
      expect(t, contains('1245/1'));
      expect(t, contains('12.00 m2 (3x4)'), reason: "o'lcham ASCII bilan");
      expect(t, contains('Express'));
      expect(t, contains("To'landi:"));
      expect(t, isNot(contains('Chegirma')));
      expect(t, isNot(contains('Qarzdorlik')));
      expect(t, isNot(contains("To'lanishi kerak")));
      expect(t, contains('Xodim: Ali'));
      expect(t, contains('rahmat'));
      expect(t, isNot(contains('Holati')), reason: 'yakunlangan buyurtmada holat yozilmaydi');
    });

    test('chegirma va qarz bilan — tenglik saqlanadi', () {
      final p = ReceiptPayment.of(order(paid: 300000, discount: 40000, debt: 100000));
      expect(p.paid + p.discount + p.debt, p.total);
      final t = text(build(order(paid: 300000, discount: 40000, debt: 100000)));
      expect(t, contains("Chegirma:"));
      expect(t, contains("40 000 so'm"));
      expect(t, contains('Qarzdorlik:'));
      expect(t, contains("100 000 so'm"));
    });

    test("yakunlanmagan — holatlar va to'lanishi kerak summa", () {
      final o = order(status: 'brought_in', paid: null, prepaid: 100000, bonus: 5000);
      final t = text(build(o, [item(1, status: 'washing'), item(2, status: 'ready', price: 80000)]));
      expect(t, contains('Holati:'));
      expect(t, contains('Yuvilmoqda'));
      expect(t, contains("shundan oldindan to'lov"));
      expect(t, contains('Bonusdan:'));
      expect(t, contains("To'lanishi kerak:"));
      expect(t, contains("335 000 so'm"), reason: '440 000 − 100 000 − 5 000');
    });

    test("ortiqcha to'lov ko'rsatiladi", () {
      final t = text(build(order(total: 90000, paid: 0, prepaid: 100000)));
      expect(t, contains("Ortiqcha to'lov"));
      expect(t, contains("10 000 so'm"));
    });

    test("eski yakunlangan buyurtma (yig'indisiz) — to'langan qolganidan tiklanadi", () {
      final p = ReceiptPayment.of(order(paid: null, prepaid: 40000));
      expect(p.paid, 440000);
      expect(p.remaining, 0);
    });

    test("o'lchanmagan mahsulot va sozlamadagi o'chirishlar", () {
      final r = buildOrderReceipt(
        order: order(status: 'new', paid: null),
        items: [item(1, status: 'pending', price: 0)],
        settings: const ReceiptSettings(showLogo: false, showItemTariff: false, showCustomerPhone: false, showCashier: false),
        now: DateTime(2026),
        cashier: 'Ali',
      );
      final t = text(r);
      expect(t, contains("o'lchanmagan"));
      expect(t, isNot(contains('Express')));
      expect(t, isNot(contains('+998')));
      expect(t, isNot(contains('Xodim')));
      expect(layoutReceipt(r, PaperWidth.mm58).any((l) => l.isLogo), isFalse);
    });
  });

  group('ESC/POS', () {
    test('baytlar: boshlash, matn, kesish', () async {
      final lines = layoutReceipt(const Receipt([ReceiptText('SALOM'), ReceiptDivider()]), PaperWidth.mm58);
      final bytes = await encodeReceipt(lines, PaperWidth.mm58);
      expect(bytes.take(2), [27, 64], reason: 'ESC @ — printerni tiklash');
      expect(String.fromCharCodes(bytes), contains('SALOM'));
      expect(String.fromCharCodes(bytes), contains('-' * 32));
      expect(bytes.sublist(bytes.length - 3), containsAllInOrder([29, 86]), reason: 'GS V — kesish');
    });

    test("logotip: 8 ga karrali en, shaffof fon oq, rang qora", () {
      final src = img.Image(width: 100, height: 20, numChannels: 4);
      for (final p in src) {
        // Chap yarmi — binafsha, o'ng yarmi — shaffof.
        if (p.x < 50) {
          p
            ..r = 0x5A
            ..g = 0x14
            ..b = 0x8C
            ..a = 255;
        } else {
          p.a = 0;
        }
      }
      final out = monochromeLogo(src, 300 ~/ 8 * 8);
      expect(out.width % 8, 0);
      expect(out.getPixel(10, 10).r, 0, reason: 'binafsha → qora');
      expect(out.getPixel(out.width - 5, 10).r, 255, reason: 'shaffof → oq');
    });
  });

  group('Printer xizmati', () {
    late _FakePort port;
    late ProviderContainer c;

    Future<void> setup({String? mac = 'AA:BB'}) async {
      SharedPreferences.setMockInitialValues({});
      final store = LocalStore(await SharedPreferences.getInstance());
      port = _FakePort();
      PrinterService.resetConnectionForTest();
      c = ProviderContainer(overrides: [
        printerPortProvider.overrideWithValue(port),
        localStoreProvider.overrideWithValue(store),
      ]);
      addTearDown(c.dispose);
      if (mac != null) await c.read(printerConfigProvider.notifier).save(PrinterConfig(mac: mac, name: 'MPT-II'));
    }

    final lines = layoutReceipt(const Receipt([ReceiptText('X')]), PaperWidth.mm58);

    test('tanlanmagan — tushunarli xato', () async {
      await setup(mac: null);
      expect(() => c.read(printerServiceProvider).printLines(lines), throwsA(isA<PrintException>()));
    });

    test("ruxsat yo'q va Bluetooth o'chiq", () async {
      await setup();
      port.permission = const PrintException('ruxsat', openSettings: true);
      await expectLater(c.read(printerServiceProvider).printLines(lines), throwsA(predicate((e) => e is PrintException && e.openSettings)));
      port.permission = null;
      port.bluetoothOn = false;
      await expectLater(
        c.read(printerServiceProvider).printLines(lines),
        throwsA(predicate((e) => e is PrintException && e.message.contains("o'chiq"))),
      );
    });

    test("ulanadi, yuboradi, keyingi chekda qayta ulanmaydi", () async {
      await setup();
      final service = c.read(printerServiceProvider);
      await service.printLines(lines);
      await service.printLines(lines);
      expect(port.connects, ['AA:BB']);
      expect(port.writes, hasLength(2));
    });

    test('uzilib qolsa — bir marta qayta ulanadi', () async {
      await setup();
      final service = c.read(printerServiceProvider);
      await service.printLines(lines);
      port.failWrites = 1;
      await service.printLines(lines);
      expect(port.connects, ['AA:BB', 'AA:BB']);
      expect(port.writes, hasLength(2));
    });

    test("ulanib bo'lmasa — xato", () async {
      await setup();
      port.connectOk = false;
      await expectLater(c.read(printerServiceProvider).printLines(lines), throwsA(isA<PrintException>()));
    });

    test('sozlama qurilmada saqlanadi', () async {
      await setup();
      await c.read(printerConfigProvider.notifier).save(const PrinterConfig(mac: 'CC', name: 'P', paper: PaperWidth.mm80));
      final store = c.read(localStoreProvider);
      expect(PrinterConfig.fromJson(store.getJson('printer.v1')).paper, PaperWidth.mm80);
    });
  });

  group('Ekranlar', () {
    late _FakePort port;

    Future<void> pump(WidgetTester tester, Widget home, {Map<String, dynamic> employee = const {}, double width = 360, double scale = 1}) async {
      SharedPreferences.setMockInitialValues({});
      final store = LocalStore(await SharedPreferences.getInstance());
      port = _FakePort();
      PrinterService.resetConnectionForTest();
      tester.view.physicalSize = Size(width * 3, 900 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [
            printerPortProvider.overrideWithValue(port),
            localStoreProvider.overrideWithValue(store),
            receiptSettingsProvider.overrideWith((ref) => Stream.value(const ReceiptSettings())),
            tariffSettingsProvider.overrideWith((ref) => Stream.value(kDefaultTariffs)),
            currentEmployeeProvider.overrideWith((ref) => Stream.value({'fullName': 'Ali', ...employee})),
            employeeClaimsProvider.overrideWith(
              (ref) async => const EmployeeClaims(employeeId: 'e', role: 'delivery', department: 'delivery'),
            ),
          ],
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: Scaffold(body: home),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets("chek tugmasi faqat vakolat bilan", (tester) async {
      await pump(tester, PrintReceiptButton(order: order(), items: [item(1)]));
      expect(find.byTooltip('Chek chiqarish'), findsNothing);
      await pump(tester, PrintReceiptButton(order: order(), items: [item(1)]), employee: {'canPrintReceipts': true});
      expect(find.byTooltip('Chek chiqarish'), findsOneWidget);
    });

    testWidgets("oldindan ko'rish: chek qatorlari, printer tanlanmagan — tanlashga yo'naltiradi", (tester) async {
      await pump(tester, PrintReceiptButton(order: order(debt: 100000, paid: 340000), items: [item(1), item(2, price: 80000)]),
          employee: {'canPrintReceipts': true}, width: 320, scale: 1.3);
      await tester.tap(find.byTooltip('Chek chiqarish'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Buyurtma #1245'), findsOneWidget);
      expect(find.textContaining('Qarzdorlik:'), findsOneWidget);
      expect(find.text('Printer tanlanmagan'), findsOneWidget);
      expect(find.text('PRINTERNI TANLASH'), findsOneWidget);
    });

    testWidgets("printer sozlamasi: juftlanganlar ro'yxati, tanlash va sinov cheki", (tester) async {
      await pump(tester, const PrinterSettingsScreen(), width: 320, scale: 1.3);
      expect(find.text('MPT-II'), findsOneWidget);
      await tester.tap(find.text('MPT-II'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
      await tester.tap(find.text('80 mm'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sinov cheki'));
      await tester.pumpAndSettle();
      expect(port.writes, hasLength(1));
      expect(String.fromCharCodes(port.writes.single), contains('SINOV CHEKI'));
      expect(find.textContaining('Sinov cheki chop etildi'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets("Bluetooth o'chiq — xato va qayta urinish", (tester) async {
      SharedPreferences.setMockInitialValues({});
      await pump(tester, const PrinterSettingsScreen());
      port.bluetoothOn = false;
      await tester.tap(find.byTooltip('Yangilash'));
      await tester.pumpAndSettle();
      expect(find.textContaining("Bluetooth o'chiq"), findsOneWidget);
      expect(find.text('Qayta urinish'), findsOneWidget);
    });

    testWidgets("chek qog'ozi 80 mm da ham sig'adi", (tester) async {
      final r = buildOrderReceipt(order: order(), items: [item(1), item(2)], settings: const ReceiptSettings(), now: DateTime(2026));
      for (final p in PaperWidth.values) {
        await pump(tester, SingleChildScrollView(child: ReceiptPaper(lines: layoutReceipt(r, p), paper: p)), width: 320, scale: 1.3);
        expect(tester.takeException(), isNull);
      }
    });
  });
}

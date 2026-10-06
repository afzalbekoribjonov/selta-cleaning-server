import 'dart:async';

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
import 'package:selta_cleaning/features/admin/printer_bridge.dart';
import 'package:selta_cleaning/features/printing/order_receipt.dart';
import 'package:selta_cleaning/features/printing/print_receipt_button.dart';
import 'package:selta_cleaning/features/printing/printer_settings_screen.dart';
import 'package:selta_cleaning/features/printing/receipt_preview_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Printer o'rnida — nima, qaysi tartibda bo'lganini yozib boradi.
class _FakePort implements PrinterPort {
  bool permission = true;
  bool bluetoothOn = true;

  /// Navbatdagi ulanish natijalari (tugasa — muvaffaqiyat).
  final connectResults = <ConnectResult>[];
  int failWrites = 0;
  Duration writeDelay = Duration.zero;
  final log = <String>[];
  final writes = <List<int>>[];
  List<PrinterDevice> devices = const [
    PrinterDevice(name: 'Quloqchin', mac: 'EE:FF'),
    PrinterDevice(name: 'MPT-II', mac: 'AA:BB', isPrinter: true),
  ];

  @override
  Future<bool> requestPermission() async => permission;
  @override
  Future<bool> isBluetoothOn() async => bluetoothOn;
  @override
  Future<List<PrinterDevice>> pairedDevices() async => devices;
  @override
  Future<ConnectResult> connect(String mac) async {
    log.add('connect:$mac');
    return connectResults.isEmpty ? ConnectResult.ok : connectResults.removeAt(0);
  }

  @override
  Future<void> disconnect() async => log.add('disconnect');
  @override
  Future<bool> write(List<int> bytes) async {
    await Future<void>.delayed(writeDelay);
    if (failWrites > 0) {
      failWrites--;
      log.add('write:fail');
      return false;
    }
    log.add('write');
    writes.add(bytes);
    return true;
  }
}

final settled = <int>[];
final _noWait = PrinterTimings(
  release: Duration.zero,
  settle: (bytes) {
    settled.add(bytes);
    return Duration.zero;
  },
);

/// [needle] baytlar ketma-ketligi [bytes] ichida bormi.
bool hasSeq(List<int> bytes, List<int> needle) {
  for (var i = 0; i + needle.length <= bytes.length; i++) {
    var ok = true;
    for (var j = 0; j < needle.length && ok; j++) {
      ok = bytes[i + j] == needle[j];
    }
    if (ok) return true;
  }
  return false;
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

  group('Baland qator', () {
    test("bo'yi ×2, eni o'zgarmaydi — nom va summa bitta qatorda", () {
      final lines = layoutReceipt(const Receipt([ReceiptPair("To'landi:", "440 000 so'm", bold: true, tall: true)]), PaperWidth.mm58);
      expect(lines.single.tall, isTrue);
      expect(lines.single.text.length, 32);
      expect(lines.single.text, startsWith("To'landi:"));
    });

    test("katta matnda baland belgisi qo'shilmaydi; bloklardan ham o'qiladi", () {
      final big = layoutReceipt(const Receipt([ReceiptText('SELTA', large: true, tall: true)]), PaperWidth.mm58).single;
      expect([big.large, big.tall], [true, false]);
      final r = Receipt.fromBlocks([
        {'kind': 'pair', 'left': 'A', 'right': 'B', 'tall': true},
        {'kind': 'text', 'text': 'C', 'tall': true},
      ]);
      expect(layoutReceipt(r, PaperWidth.mm58).every((l) => l.tall), isTrue);
    });

    test('buyurtma chekida "To\'landi" baland', () {
      final r = buildOrderReceipt(order: order(), items: [item(1)], settings: const ReceiptSettings(), now: DateTime(2026));
      final paid = layoutReceipt(r, PaperWidth.mm58).firstWhere((l) => l.text.startsWith("To'landi:"));
      expect(paid.tall, isTrue);
      expect(paid.bold, isTrue);
    });
  });

  group('ESC/POS (arzon printerlar uchun)', () {
    test("boshlash, matn, kesish YO'Q, oxirida bo'sh qatorlar", () async {
      final lines = layoutReceipt(const Receipt([ReceiptText('SALOM'), ReceiptDivider()]), PaperWidth.mm58);
      final bytes = await encodeReceipt(lines, PaperWidth.mm58);
      expect(bytes.take(2), [27, 64], reason: 'ESC @ — printerni tiklash');
      expect(String.fromCharCodes(bytes), contains('SALOM'));
      expect(String.fromCharCodes(bytes), contains('-' * 32));
      expect(hasSeq(bytes, [29, 86]), isFalse, reason: "GS V (kesish) yuborilmaydi — pichog'siz printer uni belgi qilib chiqaradi");
      expect(bytes.sublist(bytes.length - 3), [27, 100, 3], reason: "ESC d 3 — 3 qator bo'sh joy");
      final five = await encodeReceipt(lines, PaperWidth.mm58, feedLines: 5);
      expect(five.sublist(five.length - 3), [27, 100, 5]);
    });

    test("o'lchamlar: baland — GS ! 1, katta — GS ! 17, oxirida oddiyga qaytadi", () async {
      final lines = layoutReceipt(
        const Receipt([ReceiptText('SELTA', large: true), ReceiptPair("To'landi:", '1', tall: true)]),
        PaperWidth.mm58,
      );
      final bytes = await encodeReceipt(lines, PaperWidth.mm58);
      expect(hasSeq(bytes, [29, 33, 17]), isTrue);
      expect(hasSeq(bytes, [29, 33, 1]), isTrue);
      final lastSize = bytes.lastIndexOf(33);
      expect(bytes.sublist(lastSize - 1, lastSize + 2), [29, 33, 0], reason: 'keyingi chek kattalashib chiqmasin');
    });

    test('logo ESC * bilan (GS v 0 raster emas)', () async {
      final logo = await loadReceiptLogo();
      final lines = layoutReceipt(const Receipt([ReceiptLogo(), ReceiptText('X')]), PaperWidth.mm58);
      final bytes = await encodeReceipt(lines, PaperWidth.mm58, logo: logo);
      expect(hasSeq(bytes, [27, 42]), isTrue, reason: 'ESC * — ustunli rasm');
      expect(hasSeq(bytes, [29, 118, 48]), isFalse, reason: 'GS v 0 — arzon printerlarda buziladi');
    });

    test('chek logosi: 384 nuqta, faqat qora/oq, shaffofliksiz', () async {
      final logo = (await loadReceiptLogo())!;
      expect(logo.width, 384);
      expect(logo.height, inInclusiveRange(60, 140));
      var black = 0;
      for (final p in logo) {
        expect(p.r == 0 || p.r == 255, isTrue);
        expect(p.r == p.g && p.g == p.b, isTrue);
        expect(p.a, p.maxChannelValue);
        if (p.r == 0) black++;
      }
      expect(black / (logo.width * logo.height), inInclusiveRange(0.15, 0.6), reason: "logo bor, lekin qop-qora dog' emas");
    });

    test('logotip: shaffof fon oq, rang qora', () {
      final src = img.Image(width: 100, height: 20, numChannels: 4);
      for (final p in src) {
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
      final out = monochromeLogo(src, 96);
      expect(out.width, 96);
      expect(out.getPixel(10, 10).r, 0, reason: 'binafsha → qora');
      expect(out.getPixel(out.width - 5, 10).r, 255, reason: 'shaffof → oq');
    });
  });

  group('Printer xizmati', () {
    late _FakePort port;
    late ProviderContainer c;

    Future<void> setup({String? mac = 'AA:BB', int feed = 3}) async {
      SharedPreferences.setMockInitialValues({});
      final store = LocalStore(await SharedPreferences.getInstance());
      port = _FakePort();
      settled.clear();
      c = ProviderContainer(overrides: [
        printerPortProvider.overrideWithValue(port),
        localStoreProvider.overrideWithValue(store),
        printerTimingsProvider.overrideWithValue(_noWait),
      ]);
      addTearDown(c.dispose);
      if (mac != null) await c.read(printerConfigProvider.notifier).save(PrinterConfig(mac: mac, name: 'MPT-II', feedLines: feed));
    }

    final lines = layoutReceipt(const Receipt([ReceiptText('X')]), PaperWidth.mm58);

    test('printer tanlanmagan — ulanmaydi ham', () async {
      await setup(mac: null);
      expect(await c.read(printerServiceProvider).printLines(lines), PrintOutcome.noPrinterSelected);
      expect(port.log, isEmpty);
    });

    test("ruxsat yo'q — sozlamalarga yo'naltiradi; Bluetooth o'chiq", () async {
      await setup();
      port.permission = false;
      final denied = await c.read(printerServiceProvider).printLines(lines);
      expect(denied, PrintOutcome.permissionDenied);
      expect(denied.needsAppSettings, isTrue);
      port.permission = true;
      port.bluetoothOn = false;
      expect(await c.read(printerServiceProvider).printLines(lines), PrintOutcome.bluetoothOff);
      expect(port.log, isEmpty);
    });

    test('har chek: ulanadi → yuboradi → ALBATTA uzadi (keyingisida yana ulanadi)', () async {
      await setup();
      final service = c.read(printerServiceProvider);
      expect(await service.printLines(lines), PrintOutcome.ok);
      expect(await service.printLines(lines), PrintOutcome.ok);
      expect(port.log, [
        'disconnect', 'connect:AA:BB', 'write', 'disconnect', //
        'disconnect', 'connect:AA:BB', 'write', 'disconnect',
      ]);
      expect(settled, [port.writes[0].length, port.writes[1].length], reason: "yopishdan oldin bufer bo'shaydi");
    });

    test("yuborish o'xshamasa — toza ulanish bilan bir marta qayta", () async {
      await setup();
      port.failWrites = 1;
      expect(await c.read(printerServiceProvider).printLines(lines), PrintOutcome.ok);
      expect(port.log, ['disconnect', 'connect:AA:BB', 'write:fail', 'disconnect', 'connect:AA:BB', 'write', 'disconnect']);
    });

    test("ikki marta o'xshamasa — xato, ulanish baribir yopiladi", () async {
      await setup();
      port.failWrites = 2;
      expect(await c.read(printerServiceProvider).printLines(lines), PrintOutcome.writeFailed);
      expect(port.log.last, 'disconnect');
    });

    test('ulanish natijalari tushunarli xabarga aylanadi', () async {
      await setup();
      final service = c.read(printerServiceProvider);
      port.connectResults.add(ConnectResult.failed);
      expect(await service.printLines(lines), PrintOutcome.connectFailed);
      port.connectResults.add(ConnectResult.notPaired);
      expect(await service.printLines(lines), PrintOutcome.notPaired);
      port.connectResults.add(ConnectResult.bluetoothOff);
      expect(await service.printLines(lines), PrintOutcome.bluetoothOff);
      expect(port.writes, isEmpty);
      expect(port.log.where((e) => e == 'disconnect'), hasLength(6), reason: 'har urinish oxirida yopiladi');
    });

    test('bir vaqtda ikki chek — navbat bilan, aralashmaydi', () async {
      await setup();
      port.writeDelay = const Duration(milliseconds: 30);
      final service = c.read(printerServiceProvider);
      final results = await Future.wait([service.printLines(lines), service.printLines(lines)]);
      expect(results, [PrintOutcome.ok, PrintOutcome.ok]);
      expect(port.log, [
        'disconnect', 'connect:AA:BB', 'write', 'disconnect', //
        'disconnect', 'connect:AA:BB', 'write', 'disconnect',
      ]);
    });

    test("bo'sh joy sozlamasi chekka tushadi", () async {
      await setup(feed: 6);
      await c.read(printerServiceProvider).printLines(lines);
      final bytes = port.writes.single;
      expect(bytes.sublist(bytes.length - 3), [27, 100, 6]);
    });

    test("juftlanganlar: printerlar birinchi; muammo bo'lsa sababi", () async {
      await setup();
      final list = await c.read(printerServiceProvider).pairedPrinters();
      expect(list.problem, isNull);
      expect(list.devices.map((d) => d.name), ['MPT-II', 'Quloqchin']);
      port.bluetoothOn = false;
      final off = await c.read(printerServiceProvider).pairedPrinters();
      expect(off.problem, PrintOutcome.bluetoothOff);
      expect(off.devices, isEmpty);
    });

    test("sozlama qurilmada saqlanadi; bo'sh joy chegarada; printerni unutish", () async {
      await setup();
      final notifier = c.read(printerConfigProvider.notifier);
      await notifier.save(const PrinterConfig(mac: 'CC', name: 'P', paper: PaperWidth.mm80, feedLines: 4));
      final store = c.read(localStoreProvider);
      final saved = PrinterConfig.fromJson(store.getJson('printer.v1'));
      expect([saved.mac, saved.paper, saved.feedLines], ['CC', PaperWidth.mm80, 4]);
      expect(PrinterConfig.fromJson({'feed': 99}).feedLines, PrinterConfig.maxFeed);
      expect(PrinterConfig.fromJson(null).feedLines, PrinterConfig.defaultFeed);
      await notifier.forgetPrinter();
      final after = c.read(printerConfigProvider);
      expect([after.isSelected, after.paper, after.feedLines], [false, PaperWidth.mm80, 4]);
    });
  });

  group("Admin panel ko'prigi", () {
    test("xabarlar: chop etish (eski va yangi), holat, sozlama, sinov; buzilgani — e'tiborsiz", () {
      final legacy = parsePrinterBridgeMessage('{"title":"Kunlik","blocks":[{"kind":"text","text":"A"}]}');
      expect(legacy, isA<BridgePrint>());
      expect((legacy as BridgePrint).title, 'Kunlik');
      expect(legacy.receipt.lines, hasLength(1));
      final print = parsePrinterBridgeMessage('{"action":"print","blocks":[]}');
      expect(print, isA<BridgePrint>());
      expect((print as BridgePrint).title, 'Chek');
      expect(parsePrinterBridgeMessage('{"action":"status"}'), isA<BridgeStatus>());
      expect(parsePrinterBridgeMessage('{"action":"settings"}'), isA<BridgeOpenSettings>());
      expect(parsePrinterBridgeMessage('{"action":"test"}'), isA<BridgeTestPrint>());
      expect(parsePrinterBridgeMessage('{"action":"print"}'), isNull);
      expect(parsePrinterBridgeMessage('{"action":"rm -rf"}'), isNull);
      expect(parsePrinterBridgeMessage('salom'), isNull);
      expect(parsePrinterBridgeMessage('[1,2]'), isNull);
      final long = parsePrinterBridgeMessage('{"action":"print","title":"${'x' * 300}","blocks":[]}') as BridgePrint;
      expect(long.title.length, 80);
    });

    test('sahifaga javob: hodisa, holat va natija', () {
      final status = printerStatusDetail(const PrinterConfig(mac: 'AA', name: 'MPT-II', paper: PaperWidth.mm80, feedLines: 4));
      expect(status, {'type': 'status', 'selected': true, 'name': 'MPT-II', 'paperMm': 80, 'feedLines': 4});
      expect(printerStatusDetail(const PrinterConfig())['selected'], isFalse);
      expect(
        printerResultDetail(PrintOutcome.connectFailed),
        {'type': 'result', 'ok': false, 'message': PrintOutcome.connectFailed.message},
      );
      final script = printerEventScript({'name': 'A B'});
      expect(script, startsWith("window.dispatchEvent(new CustomEvent('selta-printer', {detail: "));
      expect(script, isNot(contains(' ')));
    });
  });

  group('Ekranlar', () {
    late _FakePort port;

    Future<void> pump(
      WidgetTester tester,
      Widget home, {
      Map<String, dynamic> employee = const {},
      double width = 360,
      double scale = 1,
      bool selected = false,
    }) async {
      SharedPreferences.setMockInitialValues({
        if (selected) 'printer.v1': '{"mac":"AA:BB","name":"MPT-II","paperMm":58,"feed":3}',
      });
      final store = LocalStore(await SharedPreferences.getInstance());
      port = _FakePort();
      // Logo va printer profili resurslardan o'qiladi (haqiqiy fayl o'qish) — oldindan.
      await tester.runAsync(() async {
        await loadReceiptLogo();
        await encodeReceipt(const [], PaperWidth.mm58);
      });
      tester.view.physicalSize = Size(width * 3, 900 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [
            printerPortProvider.overrideWithValue(port),
            printerTimingsProvider.overrideWithValue(_noWait),
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

    testWidgets('chek tugmasi faqat vakolat bilan', (tester) async {
      await pump(tester, PrintReceiptButton(order: order(), items: [item(1)]));
      expect(find.byTooltip('Chek chiqarish'), findsNothing);
      await pump(tester, PrintReceiptButton(order: order(), items: [item(1)]), employee: {'canPrintReceipts': true});
      expect(find.byTooltip('Chek chiqarish'), findsOneWidget);
    });

    testWidgets("printer tanlanmagan: CHOP ETISH → tanlash → o'zi chop etadi", (tester) async {
      await pump(tester, PrintReceiptButton(order: order(debt: 100000, paid: 340000), items: [item(1), item(2, price: 80000)]),
          employee: {'canPrintReceipts': true}, width: 320, scale: 1.3);
      await tester.tap(find.byTooltip('Chek chiqarish'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Buyurtma #1245'), findsOneWidget);
      expect(find.textContaining('Qarzdorlik:'), findsOneWidget);
      expect(find.text('Printer tanlanmagan'), findsOneWidget);

      await tester.tap(find.text('CHOP ETISH'));
      await tester.pumpAndSettle();
      expect(find.text('Printerni tanlang'), findsOneWidget, reason: "tanlash ekrani, ro'yxat o'zi ochiladi");
      expect(find.text('MPT-II'), findsOneWidget);
      await tester.tap(find.text('MPT-II'));
      await tester.pumpAndSettle();

      expect(port.writes, hasLength(1), reason: 'tanlangach chop etish davom etdi');
      expect(String.fromCharCodes(port.writes.single), contains('Buyurtma #1245'));
      expect(find.textContaining('Chek chop etildi'), findsOneWidget);
      expect(find.text('CHOP ETISH'), findsNothing, reason: 'muvaffaqiyatdan keyin oyna yopiladi');
    });

    testWidgets("ulanib bo'lmasa — qizil xabar va printer sozlamasiga yo'l", (tester) async {
      await pump(tester, PrintReceiptButton(order: order(), items: [item(1)]), employee: {'canPrintReceipts': true}, selected: true);
      port.connectResults.add(ConnectResult.failed);
      await tester.tap(find.byTooltip('Chek chiqarish'));
      await tester.pumpAndSettle();
      expect(find.textContaining('MPT-II · 58 mm'), findsOneWidget);
      await tester.tap(find.text('CHOP ETISH'));
      await tester.pumpAndSettle();
      expect(find.text(PrintOutcome.connectFailed.message), findsOneWidget);
      expect(find.widgetWithText(SnackBarAction, 'Printer'), findsOneWidget);
      expect(find.text('CHOP ETISH'), findsOneWidget, reason: "xato bo'lsa oyna ochiq qoladi");
    });

    testWidgets("printer sozlamasi: tanlash, qog'oz, bo'sh joy, sinov cheki, olib tashlash", (tester) async {
      await pump(tester, const PrinterSettingsScreen(), width: 320, scale: 1.3);
      expect(find.text('Printer tanlanmagan'), findsOneWidget);
      expect(find.text('MPT-II'), findsOneWidget, reason: "tanlanmagan bo'lsa ro'yxat o'zi ochiladi");
      await tester.tap(find.text('MPT-II'));
      await tester.pumpAndSettle();
      expect(find.text('Boshqa printer tanlash'), findsOneWidget);
      expect(find.textContaining('AA:BB · 58 mm'), findsOneWidget);

      await tester.tap(find.text('80 mm'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip("Ko'paytirish"));
      await tester.tap(find.byTooltip("Ko'paytirish"));
      await tester.pumpAndSettle();
      expect(find.text('4 qator'), findsOneWidget);

      await tester.ensureVisible(find.text('Sinov cheki'));
      await tester.tap(find.text('Sinov cheki'));
      await tester.pumpAndSettle();
      final bytes = port.writes.single;
      expect(String.fromCharCodes(bytes), contains('SINOV CHEKI'));
      expect(String.fromCharCodes(bytes), contains('80 mm'));
      expect(bytes.sublist(bytes.length - 3), [27, 100, 4]);
      expect(find.textContaining('Chek chop etildi'), findsOneWidget);

      await tester.drag(find.byType(Scrollable).first, const Offset(0, 800));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Printerni olib tashlash'));
      await tester.pumpAndSettle();
      expect(find.text('Printer tanlanmagan'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets("Bluetooth o'chiq / ruxsat yo'q / juftlangan qurilma yo'q — aniq ko'rsatma", (tester) async {
      await pump(tester, const PrinterSettingsScreen(), selected: true);
      expect(find.text('MPT-II'), findsOneWidget, reason: "tanlangan printer kartada; ro'yxat o'zi ochilmaydi");
      expect(find.byType(ListTile), findsNothing);

      port.bluetoothOn = false;
      await tester.tap(find.text('Boshqa printer tanlash'));
      await tester.pumpAndSettle();
      expect(find.text(PrintOutcome.bluetoothOff.message), findsOneWidget);
      expect(find.text('Qayta urinish'), findsOneWidget);

      port
        ..bluetoothOn = true
        ..permission = false;
      await tester.tap(find.text('Qayta urinish'));
      await tester.pumpAndSettle();
      expect(find.text('Sozlamalarni ochish'), findsOneWidget);

      port
        ..permission = true
        ..devices = const [];
      await tester.tap(find.text('Boshqa printer tanlash'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Juftlangan qurilma topilmadi'), findsOneWidget);
    });

    testWidgets("chek qog'ozi 58/80 mm da sig'adi, baland qator ham", (tester) async {
      final r = buildOrderReceipt(order: order(), items: [item(1), item(2)], settings: const ReceiptSettings(), now: DateTime(2026));
      for (final p in PaperWidth.values) {
        await pump(tester, SingleChildScrollView(child: ReceiptPaper(lines: layoutReceipt(r, p), paper: p)), width: 320, scale: 1.3);
        expect(tester.takeException(), isNull);
        expect(find.byType(Image), findsOneWidget, reason: 'printerdagi logo');
      }
    });
  });
}

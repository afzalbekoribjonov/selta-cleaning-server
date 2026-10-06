import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/local_store.dart';
import 'escpos_encoder.dart';
import 'printer_channel.dart';
import 'receipt.dart';

export 'printer_channel.dart' show ConnectResult, PrinterDevice;

/// Shu telefondagi printer tanlovi. Bluetooth printer har telefonga
/// alohida juftlanadi, shuning uchun tanlov ham telefonda saqlanadi.
class PrinterConfig {
  final String? mac;
  final String? name;
  final PaperWidth paper;

  /// Chek oxiridagi bo'sh qatorlar — qog'ozni yirtib olish chizig'igacha.
  final int feedLines;

  static const minFeed = 1;
  static const maxFeed = 8;
  static const defaultFeed = 3;

  const PrinterConfig({this.mac, this.name, this.paper = PaperWidth.mm58, this.feedLines = defaultFeed});

  bool get isSelected => mac != null && mac!.isNotEmpty;

  Map<String, dynamic> toJson() => {
        if (mac != null) 'mac': mac,
        if (name != null) 'name': name,
        'paperMm': paper.mm,
        'feed': feedLines,
      };

  factory PrinterConfig.fromJson(Map<String, dynamic>? j) => PrinterConfig(
        mac: j?['mac'] as String?,
        name: j?['name'] as String?,
        paper: PaperWidth.fromMm((j?['paperMm'] as num?)?.toInt()),
        feedLines: ((j?['feed'] as num?)?.toInt() ?? defaultFeed).clamp(minFeed, maxFeed),
      );

  PrinterConfig copyWith({String? mac, String? name, PaperWidth? paper, int? feedLines}) => PrinterConfig(
        mac: mac ?? this.mac,
        name: name ?? this.name,
        paper: paper ?? this.paper,
        feedLines: (feedLines ?? this.feedLines).clamp(minFeed, maxFeed),
      );

  /// Printer tanlovisiz (qog'oz va bo'sh joy sozlamasi qoladi).
  PrinterConfig withoutPrinter() => PrinterConfig(paper: paper, feedLines: feedLines);
}

/// Chop etish natijasi — har biriga xodim tushunadigan xabar.
enum PrintOutcome {
  ok('Chek chop etildi'),
  noPrinterSelected('Avval printerni tanlang'),
  permissionDenied('Bluetooth ruxsati berilmagan — sozlamalarda "Yaqin-atrofdagi qurilmalar" ruxsatini yoqing'),
  bluetoothOff("Bluetooth o'chiq — uni yoqib, qayta urinib ko'ring"),
  notPaired("Printer telefon bilan juftlanmagan — telefonning Bluetooth sozlamasidan ulang (PIN: 0000 yoki 1234)"),
  connectFailed("Printerga ulanib bo'lmadi — printer yoniq va yaqin ekanini tekshiring"),
  writeFailed("Chek printerga yetmadi — qayta urinib ko'ring");

  final String message;
  const PrintOutcome(this.message);

  bool get isOk => this == PrintOutcome.ok;

  /// Faqat ilova sozlamalaridan to'g'rilanadi (ruxsat butunlay rad etilgan).
  bool get needsAppSettings => this == PrintOutcome.permissionDenied;
}

/// Printer bilan past darajadagi aloqa — testda soxtasi qo'yiladi.
abstract class PrinterPort {
  /// Android 12+ da "Yaqin-atrofdagi qurilmalar" ruxsati.
  Future<bool> requestPermission();
  Future<bool> isBluetoothOn();
  Future<List<PrinterDevice>> pairedDevices();
  Future<ConnectResult> connect(String mac);
  Future<bool> write(List<int> bytes);
  Future<void> disconnect();
}

/// Haqiqiy Bluetooth — o'zimizning Android kanalimiz orqali
/// (BluetoothPrinterChannel.kt).
class NativePrinterPort implements PrinterPort {
  static const _channel = PrinterChannel();

  @override
  Future<bool> requestPermission() async {
    try {
      final status = await Permission.bluetoothConnect.request();
      return status.isGranted || status.isLimited;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> isBluetoothOn() => _channel.isBluetoothOn();

  @override
  Future<List<PrinterDevice>> pairedDevices() => _channel.pairedDevices();

  @override
  Future<ConnectResult> connect(String mac) => _channel.connect(mac);

  @override
  Future<bool> write(List<int> bytes) => _channel.write(bytes);

  @override
  Future<void> disconnect() => _channel.disconnect();
}

final printerPortProvider = Provider<PrinterPort>((ref) => NativePrinterPort());

/// Printer kutishlari (testlarda nolga tushiriladi).
class PrinterTimings {
  /// Ulanish yopilgach printer o'z tomonini bo'shatishi uchun — darhol
  /// qayta ulansak, u hali band bo'lib turadi.
  final Duration release;

  /// Yozib bo'lingach, soketni yopishdan oldin: Bluetooth buferidagi
  /// oxirgi baytlar printerga yetib olsin (aks holda chek oxiri kesiladi).
  final Duration Function(int bytes) settle;

  const PrinterTimings({required this.release, required this.settle});

  static Duration _settleFor(int bytes) => Duration(milliseconds: (300 + bytes ~/ 10).clamp(300, 2000));

  static const real = PrinterTimings(release: Duration(milliseconds: 600), settle: _settleFor);
}

final printerTimingsProvider = Provider<PrinterTimings>((ref) => PrinterTimings.real);

/// Tanlangan printer, qog'oz eni va bo'sh joy (telefonda saqlanadi).
class PrinterConfigNotifier extends Notifier<PrinterConfig> {
  static const _key = 'printer.v1';

  @override
  PrinterConfig build() => PrinterConfig.fromJson(ref.read(localStoreProvider).getJson(_key));

  Future<void> save(PrinterConfig config) async {
    state = config;
    await ref.read(localStoreProvider).setJson(_key, config.toJson());
  }

  Future<void> forgetPrinter() => save(state.withoutPrinter());
}

final printerConfigProvider = NotifierProvider<PrinterConfigNotifier, PrinterConfig>(PrinterConfigNotifier.new);

/// Juftlangan qurilmalar ro'yxati yoki nega olinmagani.
class PairedPrinters {
  final List<PrinterDevice> devices;
  final PrintOutcome? problem;
  const PairedPrinters(this.devices, [this.problem]);
}

/// Chek chop etish (gilam_yuvish_furqat'da arzon printerlarda sinalgan tartib):
/// ruxsat → Bluetooth → ulanish → bo'laklab yuborish → ALBATTA uzish.
///
/// Ulanish har chekda ochiladi va yopiladi: printer bir vaqtda faqat
/// bitta ulanishni qabul qiladi — ochiq qolgan ulanish boshqa telefonni
/// (masalan adminni) ham, keyingi chekni ham to'sib qo'yardi. Yuborish
/// o'xshamasa (printer uyqudan uyg'onayotgan bo'lishi mumkin) — toza
/// ulanish bilan bir marta qayta urinadi.
class PrinterService {
  final Ref _ref;
  PrinterService(this._ref);

  /// Bir vaqtda faqat bitta chek (ikki marta bosish, ikki ekran). Xizmat
  /// ilova bo'yi bitta (printerServiceProvider), shuning uchun navbat ham bitta.
  Future<void> _lock = Future.value();

  /// Printer oldingi ulanishni qachon bo'shatib bo'ladi — keyingi chek
  /// shu paytgacha kutadi.
  DateTime? _freeAt;

  PrinterPort get _port => _ref.read(printerPortProvider);
  PrinterTimings get _timings => _ref.read(printerTimingsProvider);

  Future<PrintOutcome?> _checkReady() async {
    if (!await _port.requestPermission()) return PrintOutcome.permissionDenied;
    if (!await _port.isBluetoothOn()) return PrintOutcome.bluetoothOff;
    return null;
  }

  /// Telefonga juftlangan qurilmalar — printerlar birinchi.
  Future<PairedPrinters> pairedPrinters() async {
    final problem = await _checkReady();
    if (problem != null) return PairedPrinters(const [], problem);
    final devices = [...await _port.pairedDevices()]
      ..sort((a, b) => a.isPrinter == b.isPrinter ? a.name.toLowerCase().compareTo(b.name.toLowerCase()) : (a.isPrinter ? -1 : 1));
    return PairedPrinters(devices);
  }

  Future<PrintOutcome> printLines(List<PrintedLine> lines) => _serialized(() => _print(lines));

  Future<PrintOutcome> _serialized(Future<PrintOutcome> Function() action) {
    final previous = _lock;
    final finished = Completer<void>();
    _lock = finished.future;
    final release = _timings.release;
    return previous.then((_) async {
      try {
        // Oldingi chekdan keyin printer ulanishni bo'shatishga ulgursin —
        // kutish keyingi chekda, xodim natijani darhol ko'radi.
        final wait = _freeAt?.difference(DateTime.now());
        if (wait != null && wait > Duration.zero) await Future<void>.delayed(wait);
        return await action();
      } finally {
        _freeAt = DateTime.now().add(release);
        finished.complete();
      }
    });
  }

  Future<PrintOutcome> _print(List<PrintedLine> lines) async {
    final config = _ref.read(printerConfigProvider);
    if (!config.isSelected) return PrintOutcome.noPrinterSelected;
    final problem = await _checkReady();
    if (problem != null) return problem;

    final List<int> bytes;
    try {
      final logo = lines.any((l) => l.isLogo) ? await loadReceiptLogo() : null;
      bytes = await encodeReceipt(lines, config.paper, logo: logo, feedLines: config.feedLines);
    } catch (e) {
      debugPrint("Chekni tayyorlab bo'lmadi: $e");
      return PrintOutcome.writeFailed;
    }

    final mac = config.mac!;
    try {
      // Bizdan qolgan ulanish bo'lsa ham yopiladi (masalan ilova to'satdan yopilgan).
      await _port.disconnect();
      var connected = await _port.connect(mac);
      if (connected != ConnectResult.ok) return _outcomeOf(connected);
      if (await _send(bytes)) return PrintOutcome.ok;

      await _port.disconnect();
      await Future<void>.delayed(_timings.release);
      connected = await _port.connect(mac);
      if (connected != ConnectResult.ok) return _outcomeOf(connected);
      return await _send(bytes) ? PrintOutcome.ok : PrintOutcome.writeFailed;
    } finally {
      await _port.disconnect();
    }
  }

  Future<bool> _send(List<int> bytes) async {
    if (!await _port.write(bytes)) return false;
    await Future<void>.delayed(_timings.settle(bytes.length));
    return true;
  }

  static PrintOutcome _outcomeOf(ConnectResult result) => switch (result) {
        ConnectResult.ok => PrintOutcome.ok,
        ConnectResult.bluetoothOff => PrintOutcome.bluetoothOff,
        ConnectResult.notPaired => PrintOutcome.notPaired,
        ConnectResult.failed => PrintOutcome.connectFailed,
      };
}

final printerServiceProvider = Provider<PrinterService>(PrinterService.new);

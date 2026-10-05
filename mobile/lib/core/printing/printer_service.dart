import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../services/local_store.dart';
import 'escpos_encoder.dart';
import 'receipt.dart';

/// Telefonga juftlangan Bluetooth qurilma.
class PrinterDevice {
  final String name;
  final String mac;
  const PrinterDevice({required this.name, required this.mac});
}

/// Shu qurilmadagi printer tanlovi — har xodimning telefonida o'zi
/// (printerlar har xil bo'lishi mumkin), shuning uchun qurilmada saqlanadi.
class PrinterConfig {
  final String? mac;
  final String? name;
  final PaperWidth paper;

  const PrinterConfig({this.mac, this.name, this.paper = PaperWidth.mm58});

  bool get isSelected => mac != null && mac!.isNotEmpty;

  Map<String, dynamic> toJson() => {if (mac != null) 'mac': mac, if (name != null) 'name': name, 'paperMm': paper.mm};

  factory PrinterConfig.fromJson(Map<String, dynamic>? j) => PrinterConfig(
        mac: j?['mac'] as String?,
        name: j?['name'] as String?,
        paper: PaperWidth.fromMm((j?['paperMm'] as num?)?.toInt()),
      );

  PrinterConfig copyWith({String? mac, String? name, PaperWidth? paper}) =>
      PrinterConfig(mac: mac ?? this.mac, name: name ?? this.name, paper: paper ?? this.paper);
}

/// Xodimga ko'rsatiladigan sabab bilan.
class PrintException implements Exception {
  final String message;

  /// Ruxsat butunlay rad etilgan — faqat ilova sozlamalaridan yoqiladi.
  final bool openSettings;

  const PrintException(this.message, {this.openSettings = false});

  @override
  String toString() => message;
}

/// Printer bilan past darajadagi aloqa — testda soxtasi qo'yiladi.
abstract class PrinterPort {
  /// `null` — ruxsat bor; aks holda sababi.
  Future<PrintException?> ensurePermission();
  Future<bool> isBluetoothOn();
  Future<List<PrinterDevice>> paired();
  Future<bool> connect(String mac);
  Future<void> disconnect();
  Future<bool> write(List<int> bytes);
}

/// Haqiqiy Bluetooth (print_bluetooth_thermal). Plagin Android 12+ da
/// ruxsatsiz chaqiruvlarga UMUMAN javob bermaydi — shuning uchun ruxsat
/// oldindan so'raladi va har bir chaqiruv vaqt chegarasi bilan o'ralgan.
class BluetoothPrinterPort implements PrinterPort {
  static const _timeout = Duration(seconds: 12);

  Future<T> _guard<T>(Future<T> call, T onTimeout) => call.timeout(_timeout, onTimeout: () => onTimeout);

  @override
  Future<PrintException?> ensurePermission() async {
    final status = await Permission.bluetoothConnect.request();
    if (status.isGranted || status.isLimited) return null;
    return const PrintException(
      "Bluetooth ruxsati berilmagan — ilova sozlamalarida \"Yaqin-atrofdagi qurilmalar\" ruxsatini yoqing",
      openSettings: true,
    );
  }

  @override
  Future<bool> isBluetoothOn() => _guard(PrintBluetoothThermal.bluetoothEnabled, false);

  @override
  Future<List<PrinterDevice>> paired() async {
    final list = await _guard(PrintBluetoothThermal.pairedBluetooths, const <BluetoothInfo>[]);
    return [for (final d in list) PrinterDevice(name: d.name.isEmpty ? d.macAdress : d.name, mac: d.macAdress)];
  }

  @override
  Future<bool> connect(String mac) => _guard(PrintBluetoothThermal.connect(macPrinterAddress: mac), false);

  @override
  Future<void> disconnect() async {
    await _guard(PrintBluetoothThermal.disconnect, false);
  }

  @override
  Future<bool> write(List<int> bytes) => _guard(PrintBluetoothThermal.writeBytes(bytes), false);
}

final printerPortProvider = Provider<PrinterPort>((ref) => BluetoothPrinterPort());

/// Tanlangan printer va qog'oz eni (qurilmada saqlanadi).
class PrinterConfigNotifier extends Notifier<PrinterConfig> {
  static const _key = 'printer.v1';

  @override
  PrinterConfig build() => PrinterConfig.fromJson(ref.read(localStoreProvider).getJson(_key));

  Future<void> save(PrinterConfig config) async {
    state = config;
    await ref.read(localStoreProvider).setJson(_key, config.toJson());
  }
}

final printerConfigProvider = NotifierProvider<PrinterConfigNotifier, PrinterConfig>(PrinterConfigNotifier.new);

/// Chekni chop etish: ruxsat → Bluetooth → ulanish → yuborish. Ulanish
/// keyingi cheklar uchun ochiq qoladi; uzilib qolgan bo'lsa bir marta
/// qayta ulanib urinadi.
class PrinterService {
  final Ref _ref;
  PrinterService(this._ref);

  /// Hozir ochiq ulanish qaysi printerga (plagin buni aytmaydi).
  static String? _connectedMac;

  PrinterPort get _port => _ref.read(printerPortProvider);

  Future<void> _ready() async {
    final denied = await _port.ensurePermission();
    if (denied != null) throw denied;
    if (!await _port.isBluetoothOn()) throw const PrintException("Bluetooth o'chiq — telefon sozlamasidan yoqing");
  }

  /// Telefonga juftlangan qurilmalar (printer avval telefon Bluetooth
  /// sozlamasida juftlanadi).
  Future<List<PrinterDevice>> pairedPrinters() async {
    await _ready();
    return _port.paired();
  }

  Future<void> _connect(String mac) async {
    if (_connectedMac != null) await _port.disconnect();
    _connectedMac = null;
    if (!await _port.connect(mac)) {
      throw const PrintException("Printerga ulanib bo'lmadi — printer yoniq va yaqin ekanini tekshiring");
    }
    _connectedMac = mac;
  }

  Future<void> printLines(List<PrintedLine> lines) async {
    final config = _ref.read(printerConfigProvider);
    if (!config.isSelected) throw const PrintException('Printer tanlanmagan — avval printerni tanlang');
    await _ready();

    final logo = lines.any((l) => l.isLogo) ? await loadReceiptLogo(config.paper) : null;
    final bytes = await encodeReceipt(lines, config.paper, logo: logo);

    if (_connectedMac != config.mac) await _connect(config.mac!);
    if (await _port.write(bytes)) return;
    // Ulanish uzilgan bo'lishi mumkin (printer o'chib-yongan) — qayta ulanib bir marta.
    await _connect(config.mac!);
    if (!await _port.write(bytes)) {
      _connectedMac = null;
      throw const PrintException('Chek printerga yetmadi — qayta urinib ko\'ring');
    }
  }

  /// Testlar uchun: oldingi ulanish holatini unutish.
  static void resetConnectionForTest() => _connectedMac = null;
}

final printerServiceProvider = Provider<PrinterService>(PrinterService.new);

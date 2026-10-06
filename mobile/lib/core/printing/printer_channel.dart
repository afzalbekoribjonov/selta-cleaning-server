import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Ulanish urinishining natijasi.
enum ConnectResult {
  ok,
  bluetoothOff,
  notPaired,
  failed;

  static ConnectResult fromCode(String? code) => switch (code) {
        'ok' => ConnectResult.ok,
        'bt_off' => ConnectResult.bluetoothOff,
        'not_paired' => ConnectResult.notPaired,
        _ => ConnectResult.failed,
      };
}

/// Telefonga juftlangan Bluetooth qurilma.
class PrinterDevice {
  final String name;
  final String mac;

  /// Qurilma o'zini "tasvir/printer" turida e'lon qilgan — ro'yxatda
  /// birinchi ko'rsatiladi (ba'zi printerlar buni aytmaydi, shuning uchun
  /// boshqalar ham yashirilmaydi).
  final bool isPrinter;

  const PrinterDevice({required this.name, required this.mac, this.isPrinter = false});
}

/// Android tarafidagi BluetoothPrinterChannel.kt bilan bog'lovchi qatlam.
///
/// Har bir chaqiruv vaqt chegarasi bilan: Bluetooth qurilmaga bog'liq va
/// ba'zan javob umuman kelmaydi — ilova bunday holatda ham muzlamaydi.
class PrinterChannel {
  const PrinterChannel();

  static const _channel = MethodChannel('selta/printer');

  Future<T> _call<T>(String method, {Map<String, Object?>? args, required T fallback, required Duration timeout}) async {
    try {
      final value = await _channel.invokeMethod<T>(method, args).timeout(timeout);
      return value ?? fallback;
    } catch (e) {
      debugPrint('Printer amali bajarilmadi ($method): $e');
      return fallback;
    }
  }

  Future<bool> isBluetoothOn() => _call<bool>('isBluetoothOn', fallback: false, timeout: const Duration(seconds: 5));

  Future<List<PrinterDevice>> pairedDevices() async {
    final raw = await _call<List<Object?>>('pairedDevices', fallback: const [], timeout: const Duration(seconds: 10));
    return [
      for (final entry in raw)
        if (entry is Map && (entry['mac']?.toString() ?? '').isNotEmpty)
          PrinterDevice(
            name: (entry['name']?.toString() ?? '').trim().isEmpty ? entry['mac'].toString() : entry['name'].toString().trim(),
            mac: entry['mac'].toString(),
            isPrinter: entry['printer'] == true,
          ),
    ];
  }

  /// Ikki ulanish usuli ketma-ket sinaladi — shuning uchun uzoqroq kutiladi.
  Future<ConnectResult> connect(String mac) async =>
      ConnectResult.fromCode(await _call<String>('connect', args: {'mac': mac}, fallback: 'failed', timeout: const Duration(seconds: 30)));

  Future<bool> write(List<int> bytes) =>
      _call<bool>('write', args: {'bytes': Uint8List.fromList(bytes)}, fallback: false, timeout: const Duration(seconds: 30));

  Future<void> disconnect() => _call<bool>('disconnect', fallback: true, timeout: const Duration(seconds: 5));
}

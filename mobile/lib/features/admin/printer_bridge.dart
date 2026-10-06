import 'dart:convert';

import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';

/// Admin panel (WebView) ↔ ilova printeri o'rtasidagi xabarlar.
///
/// Sahifa `window.SeltaPrinter.postMessage(JSON)` yuboradi
/// (admin_web/src/lib/app-printer.ts):
///  - `{action: 'print', title, blocks}` — chekni oldindan ko'rish va chop etish;
///  - `{action: 'status'}` — joriy printer haqida so'rash;
///  - `{action: 'settings'}` — ilovaning printer sozlamasini ochish;
///  - `{action: 'test'}` — sinov cheki.
/// Ilova javobni `selta-printer` hodisasi bilan qaytaradi ([printerEventScript]).
sealed class PrinterBridgeRequest {
  const PrinterBridgeRequest();
}

class BridgePrint extends PrinterBridgeRequest {
  final String title;
  final Receipt receipt;
  const BridgePrint(this.title, this.receipt);
}

class BridgeStatus extends PrinterBridgeRequest {
  const BridgeStatus();
}

class BridgeOpenSettings extends PrinterBridgeRequest {
  const BridgeOpenSettings();
}

class BridgeTestPrint extends PrinterBridgeRequest {
  const BridgeTestPrint();
}

/// Buzilgan yoki noma'lum xabar — `null` (e'tiborsiz qoldiriladi).
PrinterBridgeRequest? parsePrinterBridgeMessage(String raw) {
  final Object? data;
  try {
    data = jsonDecode(raw);
  } on FormatException {
    return null;
  }
  if (data is! Map) return null;
  final action = data['action'];
  // Eski admin panel versiyasi `action`siz faqat bloklarni yuboradi.
  if (action == 'print' || (action == null && data['blocks'] is List)) {
    final blocks = data['blocks'];
    if (blocks is! List) return null;
    final title = data['title'] is String && (data['title'] as String).trim().isNotEmpty ? (data['title'] as String).trim() : 'Chek';
    return BridgePrint(title.length > 80 ? title.substring(0, 80) : title, Receipt.fromBlocks(blocks));
  }
  return switch (action) {
    'status' => const BridgeStatus(),
    'settings' => const BridgeOpenSettings(),
    'test' => const BridgeTestPrint(),
    _ => null,
  };
}

/// Sahifaga hodisa yuboradigan JS. JSON ichidagi U+2028/U+2029 ham
/// qochiriladi — ular JS satrini buzadi.
String printerEventScript(Map<String, Object?> detail) {
  final json = jsonEncode(detail).replaceAll('\u2028', r'\u2028').replaceAll('\u2029', r'\u2029');
  return "window.dispatchEvent(new CustomEvent('selta-printer', {detail: $json}));";
}

Map<String, Object?> printerStatusDetail(PrinterConfig config) => {
      'type': 'status',
      'selected': config.isSelected,
      'name': config.isSelected ? (config.name ?? config.mac) : null,
      'paperMm': config.paper.mm,
      'feedLines': config.feedLines,
    };

Map<String, Object?> printerResultDetail(PrintOutcome outcome) => {
      'type': 'result',
      'ok': outcome.isOk,
      'message': outcome.message,
    };

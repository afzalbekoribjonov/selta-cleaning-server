import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart' show openAppSettings;

import '../../app/theme.dart';
import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';
import 'printer_settings_screen.dart';

/// Chekni chop etish — hamma joyda bir xil tartib (gilam_yuvish_furqat
/// kabi): printer tanlanmagan bo'lsa tanlash ekrani ochiladi va printer
/// tanlangach chop etish O'ZI davom etadi. Natija xabar bilan ko'rsatiladi.
///
/// Qatorlar qog'oz eniga qarab shu yerda joylashtiriladi — xodim tanlash
/// ekranida qog'oz enini o'zgartirgan bo'lsa ham chek to'g'ri chiqadi.
Future<PrintOutcome?> printReceiptFlow(BuildContext context, WidgetRef ref, Receipt receipt) async {
  final messenger = ScaffoldMessenger.of(context);
  final navigator = Navigator.of(context);
  final service = ref.read(printerServiceProvider);

  Future<PrintOutcome> attempt() => service.printLines(layoutReceipt(receipt, ref.read(printerConfigProvider).paper));

  var outcome = await attempt();
  if (outcome == PrintOutcome.noPrinterSelected) {
    final picked = await navigator.push<bool>(
      MaterialPageRoute(builder: (_) => const PrinterSettingsScreen(pickForPrint: true)),
    );
    if (picked != true) return null;
    outcome = await attempt();
  }
  showPrintOutcome(messenger, outcome, navigator: navigator);
  return outcome;
}

/// Natija xabari: muvaffaqiyat — yashil; xato — qizil, kerak bo'lsa
/// "Sozlamalar" (ruxsat) yoki "Printer" (ulanish) tugmasi bilan.
void showPrintOutcome(ScaffoldMessengerState messenger, PrintOutcome outcome, {NavigatorState? navigator}) {
  final SnackBarAction? action = outcome.needsAppSettings
      ? const SnackBarAction(label: 'Sozlamalar', textColor: Colors.white, onPressed: openAppSettings)
      : navigator != null && (outcome == PrintOutcome.connectFailed || outcome == PrintOutcome.notPaired)
          ? SnackBarAction(
              label: 'Printer',
              textColor: Colors.white,
              onPressed: () => navigator.push(MaterialPageRoute<bool>(builder: (_) => const PrinterSettingsScreen())),
            )
          : null;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(outcome.isOk ? '✅ ${outcome.message}' : outcome.message),
      backgroundColor: outcome.isOk ? AppColors.success : AppColors.danger,
      duration: Duration(seconds: outcome.isOk ? 3 : 6),
      action: action,
    ));
}

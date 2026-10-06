import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../app/theme.dart';
import '../../core/config.dart';
import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';
import '../../core/printing/receipt_settings.dart';
import '../../core/widgets/selta_loader.dart';
import '../printing/print_flow.dart' show showPrintOutcome;
import '../printing/printer_settings_screen.dart';
import '../printing/receipt_preview_sheet.dart';
import 'printer_bridge.dart';

/// Admin panelni (admin.seltacleaning.uz) ilova ichida ochadi.
///
/// Kirish o'sha saytning O'Z email/parol formasi orqali — bu yerda
/// hech qanday parol saqlanmaydi va ilova sessiyasiga ham tegmaydi.
/// Kirgandan keyin sessiya WebView'ning o'z xotirasida (IndexedDB,
/// Firebase Auth shu yerda saqlaydi) qoladi, shuning uchun ekran
/// keyingi ochilishlarda to'g'ridan-to'g'ri panelga tushadi.
///
/// Bu ekran faqat `--dart-define=ADMIN_PANEL=true` bilan yig'ilgan
/// buildda mavjud (core/config.dart: `kAdminPanelEnabled`).
class AdminPanelScreen extends ConsumerStatefulWidget {
  const AdminPanelScreen({super.key});

  @override
  ConsumerState<AdminPanelScreen> createState() => _AdminPanelScreenState();
}

class _AdminPanelScreenState extends ConsumerState<AdminPanelScreen> {
  late final WebViewController _controller;
  int _progress = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.bg)
      // Admin panel chek chiqarsa yoki printerni o'zgartirmoqchi bo'lsa,
      // so'rov shu kanal orqali keladi va ilovaning Bluetooth printeri
      // ishlatiladi (brauzerdan Bluetooth printerga ulanib bo'lmaydi).
      ..addJavaScriptChannel('SeltaPrinter', onMessageReceived: _onPrinterMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) => setState(() => _progress = progress),
          onPageStarted: (_) => setState(() {
            _progress = 0;
            _error = null;
          }),
          onPageFinished: (_) => setState(() => _progress = 100),
          // Faqat asosiy sahifa xatosi ko'rsatiladi — sahifa ichidagi
          // ayrim rasm/skript yuklanmasligi butun ekranni "xato"ga
          // aylantirmasligi kerak.
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? true) {
              setState(() => _error = "Sahifani ochib bo'lmadi — internetni tekshiring");
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(kAdminPanelUrl));
  }

  /// Faqat admin panel sahifasidan kelgan so'rov qabul qilinadi.
  Future<void> _onPrinterMessage(JavaScriptMessage message) async {
    final current = Uri.tryParse(await _controller.currentUrl() ?? '');
    if (current == null || current.host != Uri.parse(kAdminPanelUrl).host) return;
    final request = parsePrinterBridgeMessage(message.message);
    if (request == null || !mounted) return;
    switch (request) {
      case BridgePrint(:final title, :final receipt):
        await openReceiptPreview(context, receipt: receipt, title: title);
      case BridgeStatus():
        break;
      case BridgeOpenSettings():
        await Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => const PrinterSettingsScreen()));
      case BridgeTestPrint():
        await _testPrint();
    }
    // Har qanday so'rovdan keyin sahifa printer holatini yangilab oladi.
    if (!mounted) return;
    await _sendToPage(printerStatusDetail(ref.read(printerConfigProvider)));
  }

  Future<void> _testPrint() async {
    final messenger = ScaffoldMessenger.of(context);
    if (!ref.read(printerConfigProvider).isSelected) {
      // Avval printer tanlanadi, keyin sinov cheki o'zi chiqadi.
      final picked = await Navigator.of(context).push(
        MaterialPageRoute<bool>(builder: (_) => const PrinterSettingsScreen(pickForPrint: true)),
      );
      if (picked != true || !mounted) return;
    }
    final config = ref.read(printerConfigProvider);
    final settings = ref.read(receiptSettingsProvider).valueOrNull ?? const ReceiptSettings();
    final outcome = await ref
        .read(printerServiceProvider)
        .printLines(layoutReceipt(testReceipt(settings, config.paper, DateTime.now()), config.paper));
    showPrintOutcome(messenger, outcome);
    await _sendToPage(printerResultDetail(outcome));
  }

  Future<void> _sendToPage(Map<String, Object?> detail) async {
    try {
      await _controller.runJavaScript(printerEventScript(detail));
    } catch (_) {
      // Sahifa yangilanayotgan bo'lsa — keyingi so'rovda yana yuboriladi.
    }
  }

  Future<void> _handleBack() async {
    // Panel ichida sahifalar bo'ylab yurilgan bo'lsa, avval o'sha
    // tarixdan orqaga qaytiladi — ilovadan chiqib ketilmaydi.
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: _handleBack,
            tooltip: 'Orqaga',
          ),
          title: const Text('Admin panel', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              onPressed: () => _controller.reload(),
              tooltip: 'Yangilash',
            ),
          ],
          bottom: _progress > 0 && _progress < 100
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(
                    value: _progress / 100,
                    minHeight: 2,
                    backgroundColor: Colors.white24,
                    valueColor: const AlwaysStoppedAnimation(AppColors.accent),
                  ),
                )
              : null,
        ),
        body: _error != null
            ? _ErrorView(
                message: _error!,
                onRetry: () {
                  setState(() => _error = null);
                  _controller.loadRequest(Uri.parse(kAdminPanelUrl));
                },
              )
            : Stack(
                children: [
                  WebViewWidget(controller: _controller),
                  if (_progress < 100)
                    const ColoredBox(
                      color: AppColors.bg,
                      child: Center(child: SeltaLoader(label: 'Admin panel yuklanmoqda')),
                    ),
                ],
              ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 46, color: AppColors.gray),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.grayDark),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }
}

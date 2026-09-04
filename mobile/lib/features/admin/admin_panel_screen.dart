import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../app/theme.dart';
import '../../core/config.dart';
import '../../core/widgets/selta_loader.dart';

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
class AdminPanelScreen extends StatefulWidget {
  const AdminPanelScreen({super.key});

  @override
  State<AdminPanelScreen> createState() => _AdminPanelScreenState();
}

class _AdminPanelScreenState extends State<AdminPanelScreen> {
  late final WebViewController _controller;
  int _progress = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.bg)
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

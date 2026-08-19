import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../services/connectivity_service.dart';

/// Butun ilovani o'rab turadi (`MaterialApp.router`ning `builder`i orqali).
/// Talab #1: faqat haqiqiy "internet yo'q" holatida to'liq "Qayta urinish"
/// ekrani chiqadi, aks holda ilova har doim faol ishlab turadi. Pastdagi
/// ekran (`child`) HECH QACHON qayta qurilmaydi/almashtirilmaydi — ustiga
/// shunchaki qatlam (overlay) sifatida qo'yiladi, shuning uchun aloqa
/// tiklanganda ilova aynan o'sha holatidan (navigatsiya, forma holati va
/// h.k.) davom etadi.
class ConnectivityGate extends ConsumerStatefulWidget {
  final Widget? child;
  const ConnectivityGate({super.key, required this.child});

  @override
  ConsumerState<ConnectivityGate> createState() => _ConnectivityGateState();
}

class _ConnectivityGateState extends ConsumerState<ConnectivityGate> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Ilova fonda uzoq turgach qaytarilganda tarmoq holati o'zgargan
    // bo'lishi mumkin, lekin plagin oqimi shu payt faol bo'lmaganligi
    // sabab hodisani o'tkazib yuborishi mumkin — shuning uchun har safar
    // qayta faollashganda holatni qo'lda qayta tekshiramiz.
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(connectivityProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final connectivityAsync = ref.watch(connectivityProvider);
    // Boshlang'ich holat aniqlanmaguncha (juda qisqa lahza) offline deb
    // hisoblamaymiz — aks holda ilova ochilishida bir lahza "Qayta urinish"
    // ko'rinib ketishi mumkin.
    final offline = connectivityAsync.valueOrNull == false;

    return Stack(
      children: [
        if (widget.child != null) widget.child!,
        if (offline) const _NoConnectionScreen(),
      ],
    );
  }
}

class _NoConnectionScreen extends StatefulWidget {
  const _NoConnectionScreen();

  @override
  State<_NoConnectionScreen> createState() => _NoConnectionScreenState();
}

class _NoConnectionScreenState extends State<_NoConnectionScreen> {
  bool _retrying = false;

  Future<void> _retry() async {
    setState(() => _retrying = true);
    // `connectivityProvider` haqiqiy o'zgarishlarni o'zi avtomatik ushlaydi;
    // bu yerda faqat "tekshirilmoqda" tugma holatini ko'rsatish uchun kichik
    // kechikish bilan qayta tekshiramiz (talab: "tugma bosilganda loading
    // icon tugmada aylanib turishi kerak natija ko'rsatilguncha").
    await Connectivity().checkConnectivity();
    await Future.delayed(const Duration(milliseconds: 700));
    if (mounted) setState(() => _retrying = false);
  }

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: AppColors.primary,
        child: DecoratedBox(
          decoration: const BoxDecoration(gradient: primaryGradient),
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.wifi_off_rounded, color: Colors.white, size: 42),
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Internet aloqasi yo\'q',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Ilovadan foydalanish uchun tarmoqqa ulaning',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 14, height: 1.4),
                    ),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: 220,
                      height: 52,
                      child: FilledButton(
                        onPressed: _retrying ? null : _retry,
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: AppColors.primary,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        child: _retrying
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.primary),
                              )
                            : const Text('Qayta urinish', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

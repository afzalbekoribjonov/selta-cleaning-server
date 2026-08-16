import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';

/// Ilova ochilganda ko'rsatiladigan brendlangan yuklanish ekrani.
/// Talab: "malumotlar yuklanguncha haqiqiy dizayndagi loading loaderi
/// bo'lishi" — birinchi PIN kirishda ham, keshlangan sessiya bilan
/// avtomatik kirishda ham shu ekran ko'rsatiladi (auth holati aniqlanguncha).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _floatController;
  late final AnimationController _ringController;

  @override
  void initState() {
    super.initState();
    _floatController = AnimationController(vsync: this, duration: const Duration(seconds: 3))
      ..repeat(reverse: true);
    _ringController = AnimationController(vsync: this, duration: const Duration(seconds: 12))..repeat();

    // TODO(auth): Firebase Auth holati tekshirilgach (currentUser bor/yo'q),
    // shu yerdan avtomatik '/select' yoki xodim paneliga yo'naltiriladi.
    // Hozircha (Faza 0 — kredentsialsiz) shunchaki qisqa animatsiyadan so'ng
    // bo'lim tanlash ekraniga o'tadi.
    Future.delayed(const Duration(milliseconds: 1400), () {
      if (mounted) context.go('/select');
    });
  }

  @override
  void dispose() {
    _floatController.dispose();
    _ringController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 148,
              height: 148,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  RotationTransition(
                    turns: _ringController,
                    child: CustomPaint(
                      size: const Size(148, 148),
                      painter: _DashedRingPainter(Colors.white.withValues(alpha: 0.35)),
                    ),
                  ),
                  AnimatedBuilder(
                    animation: _floatController,
                    builder: (context, child) {
                      final dy = math.sin(_floatController.value * math.pi) * -6;
                      return Transform.translate(offset: Offset(0, dy), child: child);
                    },
                    child: Image.asset('assets/brand/icon_white.png', width: 96, height: 96),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            Text(
              'SELTA CLEANING',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Boshqaruv tizimi',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 14),
            ),
            const SizedBox(height: 40),
            SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation(Colors.white.withValues(alpha: 0.85)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashedRingPainter extends CustomPainter {
  final Color color;
  const _DashedRingPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 1;
    const dashCount = 24;
    const sweep = (2 * math.pi) / dashCount;
    for (var i = 0; i < dashCount; i++) {
      if (i.isOdd) continue;
      canvas.drawArc(Rect.fromCircle(center: center, radius: radius), i * sweep, sweep * 0.6, false, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRingPainter oldDelegate) => oldDelegate.color != color;
}

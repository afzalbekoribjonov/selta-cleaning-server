import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/config.dart';
import '../../core/constants.dart';
import '../../core/utils/date_utils.dart';

/// "Boshqa" — doimiy bo'limlarga kirmaydigan (admin yaratgan kasblardagi)
/// xodimlar. Avval pastda kichik matnli havola edi — ko'pchilik uni
/// sezmasdi; endi u ham boshqa bo'limlar qatorida, bir xil kartada.
const _otherInfo = DepartmentInfo(
  label: 'Boshqa',
  description: 'Boshqa kasbdagi xodimlar',
  icon: Icons.groups_2_rounded,
);

/// Har bir bo'limning o'z rangi — kartalar bir qarashda ajralsin.
const _tileColors = <String, Color>{
  'dispatcher': AppColors.primary,
  'worker': AppColors.info,
  'delivery': Color(0xFF0E9488),
  'other': Color(0xFFDD6B20),
};

/// Bo'lim tanlash ekrani — brendlangan gradient bosh qism + 2×2 bo'lim
/// kartalari: Sotuv menejeri, Ishchi, Dastavchik va Boshqa.
class RoleSelectScreen extends StatelessWidget {
  const RoleSelectScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      // `_HeroHeader`ning ichki tarkibi (Stack -> Padding -> Column) tabiiy
      // eniga moslashadi (shrink-wrap) — stretch bo'lmasa, Column uni
      // markazlashtirib qo'yardi va ikki yon tomondan bo'sh joy ko'rinardi
      // (talab: "yon taraflarida xunuk ko'rinmoqda" — shu bug tuzatildi).
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _HeroHeader(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Bo'limingizni tanlang",
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink),
                  ),
                  const SizedBox(height: 14),
                  // Kartalar balandligi matnga qarab (katta shrift sozlamasida
                  // ham kesilmaydi) — qat'iy nisbatli GridView emas.
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final tileWidth = (constraints.maxWidth - 12) / 2;
                      final tiles = [
                        for (final entry in kDepartmentConfig.entries)
                          (entry.value, entry.key.name),
                        (_otherInfo, 'other'),
                      ];
                      return Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          for (final (info, key) in tiles)
                            SizedBox(
                              width: tileWidth,
                              child: _DepartmentTile(
                                info: info,
                                color: _tileColors[key] ?? AppColors.primary,
                                onTap: () => context.push('/employees/$key'),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  Center(
                    child: Text(
                      '© 2026 Selta Cleaning',
                      style: TextStyle(color: AppColors.gray, fontSize: 12, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroHeader extends StatelessWidget {
  const _HeroHeader();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: primaryGradient),
      child: SafeArea(
        bottom: false,
        child: ClipRect(
          child: Stack(
            children: [
              Positioned(
                right: -40,
                top: -50,
                child: _glowCircle(160),
              ),
              Positioned(
                left: -50,
                bottom: -70,
                child: _glowCircle(140),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 30),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Logotipni 2 SONIYA bosib turish admin panelni ochadi —
                    // faqat ADMIN_PANEL bayrog'i bilan yig'ilgan buildda.
                    // Yashirin ataylab: bu tugma xodimlarga ko'rinmasligi
                    // kerak, oddiy buildda esa u umuman mavjud emas
                    // (router.dart).
                    const _AdminPanelHoldTarget(
                      child: Image(image: AssetImage('assets/brand/lockup_white.png'), height: 30),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Xush kelibsiz',
                      style: TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      formatWeekdayDateUz(DateTime.now()),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 13.5, height: 1.4),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Haqiqiy blur o'rniga radial gradient bilan "porlash" effekti — chekka
  // to'liq shaffoflikka susayadi, shuning uchun ClipRect chetlab kesib
  // qo'ysa ham qattiq/g'alati chiziq ko'rinmaydi (avvalgi tekis rangli
  // doiraning kesilishi bilan bog'liq muammo shu tarzda hal qilindi).
  Widget _glowCircle(double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [Colors.white.withValues(alpha: 0.16), Colors.white.withValues(alpha: 0.0)],
          stops: const [0.0, 0.72],
        ),
      ),
    );
  }
}

class _DepartmentTile extends StatelessWidget {
  final DepartmentInfo info;
  final Color color;
  final VoidCallback onTap;

  const _DepartmentTile({required this.info, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 148),
          padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
            boxShadow: [
              BoxShadow(color: AppColors.primary.withValues(alpha: 0.05), blurRadius: 14, offset: const Offset(0, 5)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(info.icon, color: color, size: 24),
                  ),
                  const Spacer(),
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(color: AppColors.bg, shape: BoxShape.circle),
                    child: const Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.grayDark),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                info.label,
                style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.2),
              ),
              const SizedBox(height: 4),
              Text(
                info.description,
                style: const TextStyle(fontSize: 12, color: AppColors.grayDark, height: 1.3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


/// Logotipni UZOQ bosib turish orqali admin panelni ochadi.
///
/// Flutterning `onLongPress` hodisasi ~0.5 soniyada ishlaydi — tasodifan
/// tegib ketish uchun yetarli. Shu sababli o'z taymerimiz: barmoq
/// [_holdDuration] davomida uzluksiz turishi kerak, ko'tarilsa yoki
/// gesture bekor qilinsa taymer to'xtaydi.
///
/// `Listener` ishlatiladi (`GestureDetector` emas): u xom ko'rsatkich
/// hodisalarini oladi va boshqa gesture'lar bilan raqobatga kirishmaydi,
/// ya'ni ekran aylantirilganda ham to'g'ri bekor bo'ladi.
class _AdminPanelHoldTarget extends StatefulWidget {
  final Widget child;
  const _AdminPanelHoldTarget({required this.child});

  @override
  State<_AdminPanelHoldTarget> createState() => _AdminPanelHoldTargetState();
}

class _AdminPanelHoldTargetState extends State<_AdminPanelHoldTarget> {
  static const _holdDuration = Duration(seconds: 2);
  Timer? _timer;
  bool _holding = false;

  void _start() {
    _timer?.cancel();
    setState(() => _holding = true);
    _timer = Timer(_holdDuration, () {
      if (!mounted) return;
      setState(() => _holding = false);
      HapticFeedback.mediumImpact();
      context.push('/admin-panel');
    });
  }

  void _cancel() {
    _timer?.cancel();
    _timer = null;
    if (_holding && mounted) setState(() => _holding = false);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Bayroqsiz buildda butun mexanizm yo'q — bolaning o'zi qaytariladi.
    if (!kAdminPanelEnabled) return widget.child;

    return Listener(
      // `opaque` ATAYLAB: logotip PNG'ining shaffof joylariga tegilganda
      // ham bosish qayd etilsin, va nishon maydoni logotipning o'zidan
      // kattaroq bo'lsin — 30px balandlikdagi rasmni 4 soniya aniq
      // ushlab turish qiyin edi.
      behavior: HitTestBehavior.opaque,
      onPointerDown: (_) => _start(),
      onPointerUp: (_) => _cancel(),
      onPointerCancel: (_) => _cancel(),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        // Bosib turilganda logotip sekin xiralashadi — mexanizm
        // ishlayotganining yagona belgisi. Chetdan qaraganda bilinmaydi:
        // u faqat barmoq bir necha soniya turgandagina sezilarli bo'ladi.
        child: AnimatedOpacity(
          opacity: _holding ? 0.45 : 1,
          duration: _holdDuration,
          curve: Curves.easeIn,
          child: widget.child,
        ),
      ),
    );
  }
}

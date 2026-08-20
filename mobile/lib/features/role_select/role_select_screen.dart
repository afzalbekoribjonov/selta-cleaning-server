import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';

/// Bo'lim tanlash ekrani — brendlangan gradient bosh qism + ixcham
/// grid ko'rinishidagi bo'lim kartalari (talab: "tugmalar haddan ziyod
/// katta va xunuk ko'rinmoqda" — to'g'irlangan). Pastda 4 ta doimiy
/// bo'limga tegishli bo'lmagan xodimlar uchun "Boshqa" matnli havola.
class RoleSelectScreen extends StatelessWidget {
  const RoleSelectScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Column(
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
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.98,
                    children: [
                      for (final entry in kDepartmentConfig.entries)
                        _DepartmentTile(
                          info: entry.value,
                          onTap: () => context.push('/employees/${entry.key.name}'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton.icon(
                      onPressed: () => context.push('/employees/other'),
                      icon: const Icon(Icons.more_horiz_rounded, size: 18, color: AppColors.grayDark),
                      label: const Text(
                        'Boshqa',
                        style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
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
                    Image.asset('assets/brand/lockup_white.png', height: 30),
                    const SizedBox(height: 24),
                    const Text(
                      'Xush kelibsiz',
                      style: TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      "Davom etish uchun bo'limingizni tanlang",
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
  final VoidCallback onTap;

  const _DepartmentTile({required this.info, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
            boxShadow: [
              BoxShadow(color: AppColors.primary.withValues(alpha: 0.05), blurRadius: 14, offset: const Offset(0, 5)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: const BoxDecoration(gradient: heroGradient, shape: BoxShape.circle),
                child: Icon(info.icon, color: Colors.white, size: 20),
              ),
              const SizedBox(height: 12),
              Text(
                info.label,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
              const SizedBox(height: 3),
              Text(
                info.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark, height: 1.25),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

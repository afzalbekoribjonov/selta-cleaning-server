import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';

/// Bo'lim tanlash ekrani — talab #1: har bir bo'lim asosiy ekranda
/// kattaroq va to'liq o'zbek tilida nomlar bilan ko'rsatiladi (reference
/// ilovadagi kichik/siqilgan tugmalar emas).
class RoleSelectScreen extends StatelessWidget {
  const RoleSelectScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Image.asset('assets/brand/lockup_purple.png', height: 40),
              const SizedBox(height: 28),
              Text(
                'Xush kelibsiz',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'Davom etish uchun bo’limingizni tanlang',
                style: TextStyle(color: AppColors.grayDark, fontSize: 15, height: 1.4),
              ),
              const SizedBox(height: 28),
              for (final entry in kDepartmentConfig.entries) ...[
                _DepartmentCard(
                  info: entry.value,
                  onTap: () => context.push('/employees/${entry.key.name}'),
                ),
                const SizedBox(height: 16),
              ],
              const SizedBox(height: 12),
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
    );
  }
}

class _DepartmentCard extends StatelessWidget {
  final DepartmentInfo info;
  final VoidCallback onTap;

  const _DepartmentCard({required this.info, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.border),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.06),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: const BoxDecoration(gradient: heroGradient, shape: BoxShape.circle),
                child: Icon(info.icon, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      info.label,
                      style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      info.description,
                      style: const TextStyle(fontSize: 13, color: AppColors.grayDark, height: 1.3),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.gray, size: 26),
            ],
          ),
        ),
      ),
    );
  }
}

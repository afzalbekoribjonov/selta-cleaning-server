import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/widgets/confirm_logout.dart';
import '../../core/widgets/selta_loader.dart';
import 'today_activity_section.dart';

String _resolveDepartmentLabel(String? key, String? customLabel) {
  if (key == null) return '';
  for (final d in Department.values) {
    if (d.name == key) return kDepartmentConfig[d]!.label;
  }
  return customLabel ?? key;
}

const _categoryLabels = {'gilam': 'Gilam', 'parda': 'Parda', 'boshqa': 'Boshqa'};
String _categoryLabel(String key) => _categoryLabels[key] ?? key;

/// Pickup buyurtmalarda yuvish/yetkazish item-darajasida bo'lgani uchun
/// ishchi/dastavchik uchun massiv (array-contains mantig'i) tekshiriladi
/// — admin_web'dagi DEPARTMENT_ATTRIBUTION_FIELD bilan bir xil.
/// Xodim ismini bosgach ochiladigan sahifa (talab #6) — yuqori o'ngdagi
/// alohida "chiqish" tugmasi olib tashlanib, o'rniga shu sahifa ichida
/// "Tizimdan chiqish" (tasdiqlashdan so'ng) joylashtirildi. Shu oydagi
/// faoliyat statistikasi ham shu yerda.
class EmployeeProfileScreen extends ConsumerWidget {
  const EmployeeProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeeAsync = ref.watch(currentEmployeeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: employeeAsync.when(
        loading: () => const SeltaLoadingView(),
        error: (err, _) => Center(child: Text(describeApiError(err))),
        data: (employee) {
          if (employee == null) return const SizedBox.shrink();
          final departmentKey = employee['department'] as String?;
          final departmentLabel = _resolveDepartmentLabel(departmentKey, employee['departmentLabel'] as String?);
          final fullName = employee['fullName'] as String? ?? '';
          final phone = employee['phone'] as String? ?? '';
          final specializations = (employee['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
          final canPack = employee['canPack'] as bool? ?? false;
          final canCreateOrders = employee['canCreateOrders'] as bool? ?? false;

          return ListView(
            padding: EdgeInsets.zero,
            children: [
              _ProfileHeader(fullName: fullName, departmentLabel: departmentLabel),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (phone.isNotEmpty) ...[
                      Row(
                        children: [
                          const Icon(Icons.phone_rounded, size: 16, color: AppColors.grayDark),
                          const SizedBox(width: 8),
                          Text(phone, style: const TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 24),
                    ],
                    if (departmentKey == 'worker' && (specializations.isNotEmpty || canPack)) ...[
                      const Text('Lavozimlar', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in specializations) _PositionBadge(label: _categoryLabel(s)),
                          if (canPack) const _PositionBadge(label: 'Upakovkachi', accent: true),
                        ],
                      ),
                      const SizedBox(height: 28),
                    ],
                    TodayActivitySection(departmentKey: departmentKey, canCreateOrders: canCreateOrders),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => confirmLogout(context, ref),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.danger,
                          side: const BorderSide(color: AppColors.danger),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        icon: const Icon(Icons.logout_rounded, size: 18),
                        label: const Text('Tizimdan chiqish', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  final String fullName;
  final String departmentLabel;

  const _ProfileHeader({required this.fullName, required this.departmentLabel});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: primaryGradient),
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      child: Column(
        children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.15),
              border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 2),
            ),
            alignment: Alignment.center,
            child: Text(
              fullName.isNotEmpty ? fullName[0].toUpperCase() : '?',
              style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            fullName,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800),
          ),
          if (departmentLabel.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              departmentLabel,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }
}

class _PositionBadge extends StatelessWidget {
  final String label;
  final bool accent;
  const _PositionBadge({required this.label, this.accent = false});

  @override
  Widget build(BuildContext context) {
    final color = accent ? AppColors.accent : AppColors.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12.5)),
    );
  }
}


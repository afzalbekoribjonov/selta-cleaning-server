import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/confirm_logout.dart';
import '../../core/widgets/selta_loader.dart';

String _resolveDepartmentLabel(String? key, String? customLabel) {
  if (key == null) return '';
  for (final d in Department.values) {
    if (d.name == key) return kDepartmentConfig[d]!.label;
  }
  return customLabel ?? key;
}

int _attributedCount(String field, Order o, String employeeId) {
  final actor = switch (field) {
    'createdBy' => o.createdBy,
    'washedBy' => o.washedBy,
    'deliveredBy' => o.deliveredBy,
    'qcRatedBy' => o.qcRatedBy,
    _ => null,
  };
  return actor == employeeId ? 1 : 0;
}

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
                    const Text('Bu oy statistikasi', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 12),
                    _MonthlyStatsCard(departmentKey: departmentKey),
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

class _MonthlyStatsCard extends ConsumerWidget {
  final String? departmentKey;
  const _MonthlyStatsCard({required this.departmentKey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Department? dept;
    for (final d in Department.values) {
      if (d.name == departmentKey) dept = d;
    }
    final field = dept != null ? attributionFieldFor(dept) : null;
    final claims = ref.watch(employeeClaimsProvider).value;

    if (field == null || claims == null) {
      return const _StatTile(
        icon: Icons.info_outline_rounded,
        label: "Bu kasb uchun buyurtma statistikasi yo'q",
        value: '—',
      );
    }
    final resolvedField = field;
    final employeeId = claims.employeeId;

    final ordersAsync = ref.watch(recentOrdersProvider);
    return ordersAsync.when(
      loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: SeltaLoader(size: 32))),
      error: (_, __) => const Text("Statistikani yuklab bo'lmadi", style: TextStyle(color: AppColors.grayDark)),
      data: (orders) {
        final now = DateTime.now();
        final monthStart = DateTime(now.year, now.month, 1);
        final monthCount = orders
            .where((o) => !o.createdAt.isBefore(monthStart))
            .fold<int>(0, (s, o) => s + _attributedCount(resolvedField, o, employeeId));
        final totalCount = orders.fold<int>(0, (s, o) => s + _attributedCount(resolvedField, o, employeeId));

        return Row(
          children: [
            Expanded(child: _StatTile(icon: Icons.calendar_month_rounded, label: 'Bu oy qatnashgan', value: '$monthCount ta')),
            const SizedBox(width: 12),
            Expanded(child: _StatTile(icon: Icons.list_alt_rounded, label: "So'nggi ro'yxatda", value: '$totalCount ta')),
          ],
        );
      },
    );
  }
}

class _StatTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _StatTile({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: AppColors.primary, size: 18),
          ),
          const SizedBox(height: 10),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/widgets/confirm_logout.dart';
import '../../core/widgets/selta_loader.dart';
import '../delivery/delivery_daily_orders_screen.dart';
import '../delivery/delivery_daily_stats.dart';

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
int _attributedCount(Department department, Order o, String employeeId) {
  final matches = switch (department) {
    Department.dispatcher => o.createdBy == employeeId,
    Department.worker => o.washedByEmployees.contains(employeeId),
    Department.delivery => o.deliveredByEmployees.contains(employeeId),
  };
  return matches ? 1 : 0;
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
          final specializations = (employee['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
          final canPack = employee['canPack'] as bool? ?? false;

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
                    const Text('Bu oy statistikasi', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 12),
                    _MonthlyStatsCard(departmentKey: departmentKey),
                    if (departmentKey == 'delivery') ...[
                      const SizedBox(height: 28),
                      const _DeliveryDailyStatsSection(),
                    ],
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
    final claims = ref.watch(employeeClaimsProvider).value;

    if (dept == null || claims == null) {
      return const _StatTile(
        icon: Icons.info_outline_rounded,
        label: "Bu kasb uchun buyurtma statistikasi yo'q",
        value: '—',
      );
    }
    final resolvedDept = dept;
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
            .fold<int>(0, (s, o) => s + _attributedCount(resolvedDept, o, employeeId));
        final totalCount = orders.fold<int>(0, (s, o) => s + _attributedCount(resolvedDept, o, employeeId));

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

/// Dastavchi uchun "Bugun"/"Kecha" — faqat shu xodimning O'ZI olib
/// kelgan/yetkazgan buyurtmalari (boshqa dastavchiklarniki emas, talab).
class _DeliveryDailyStatsSection extends ConsumerWidget {
  const _DeliveryDailyStatsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claims = ref.watch(employeeClaimsProvider).valueOrNull;
    final ordersAsync = ref.watch(recentOrdersProvider);

    if (claims == null) return const SizedBox.shrink();

    return ordersAsync.when(
      loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Center(child: SeltaLoader(size: 32))),
      error: (_, __) => const Text("Statistikani yuklab bo'lmadi", style: TextStyle(color: AppColors.grayDark)),
      data: (orders) {
        final today = DateTime.now();
        final yesterday = today.subtract(const Duration(days: 1));
        final todayStats = computeDeliveryDayStats(ref, orders, claims.employeeId, today);
        final yesterdayStats = computeDeliveryDayStats(ref, orders, claims.employeeId, yesterday);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DayStatsCard(title: 'Bugun', day: today, stats: todayStats),
            const SizedBox(height: 12),
            _DayStatsCard(title: 'Kecha', day: yesterday, stats: yesterdayStats),
          ],
        );
      },
    );
  }
}

class _DayStatsCard extends StatelessWidget {
  final String title;
  final DateTime day;
  final DeliveryDayStats stats;
  const _DayStatsCard({required this.title, required this.day, required this.stats});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 8),
          _StatLine(label: 'Sana', value: formatDateUz(day)),
          _StatLine(
            label: 'Olib kelindi',
            value: '${stats.pickedUpOrders.length} ta; ${stats.pickedUpTotal.toStringAsFixed(0)} so\'m',
          ),
          _StatLine(
            label: 'Yetgazildi',
            value: '${stats.deliveredItemCount} ta; ${stats.deliveredTotal.toStringAsFixed(0)} so\'m',
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => openDeliveryDailyOrdersScreen(context, day: day, initialFilter: 'picked_up'),
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: const Text("Ularni ko'rish", style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatLine extends StatelessWidget {
  final String label;
  final String value;
  const _StatLine({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 90, child: Text('$label:', style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 12.5, color: AppColors.ink, fontWeight: FontWeight.w700))),
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

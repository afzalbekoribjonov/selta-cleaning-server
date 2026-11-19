import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/staff_directory.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/employee_avatar.dart';
import 'order_sorting.dart' show TariffDots;
import 'team_job_detail_sheet.dart';

/// Joyida yuvish buyurtmalari (xodim jamoa a'zosi bo'lganlari) — alohida
/// sahifa. Dastavchikda bosh ekranda emas, yuqori o'ng burchakdagi belgi
/// orqali ochiladi (talab: bosh ekranda chalkashlik bor edi).
class TeamJobsScreen extends ConsumerWidget {
  const TeamJobsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeeId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;
    final ordersAsync = employeeId == null ? const AsyncValue<List<Order>>.loading() : ref.watch(myTeamOrdersProvider(employeeId));
    final orders = [...(ordersAsync.valueOrNull ?? const <Order>[])]
      // Ish ketayotgani tepada, keyin muddati yaqini.
      ..sort((a, b) {
        final ia = a.status == 'in_progress' ? 0 : 1;
        final ib = b.status == 'in_progress' ? 0 : 1;
        if (ia != ib) return ia.compareTo(ib);
        final da = a.dueDate ?? DateTime(9999);
        final db = b.dueDate ?? DateTime(9999);
        return da.compareTo(db);
      });

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Joyida yuvish'),
            Text(
              orders.isEmpty ? 'Biriktirilgan buyurtma yo\'q' : '${orders.length} ta buyurtma',
              style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
      body: ordersAsync.isLoading && orders.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : orders.isEmpty
              ? const _Empty()
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                  itemCount: orders.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, i) => TeamJobCard(order: orders[i], onTap: () => openTeamJobDetailSheet(context, orders[i])),
                ),
    );
  }
}

/// Joyida yuvish buyurtmasi kartasi — holat, muddat, manzil va JAMOA
/// (har bir a'zo ismi va kasbi bilan).
class TeamJobCard extends ConsumerWidget {
  final Order order;
  final VoidCallback onTap;
  const TeamJobCard({super.key, required this.order, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffDirectoryProvider).valueOrNull;
    final status = statusOf(order.status);
    final overdue = order.isOverdue;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: overdue ? AppColors.danger.withValues(alpha: 0.5) : AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                decoration: const BoxDecoration(gradient: heroGradient),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            order.displayNumber,
                            style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                      child: Text(status.label, style: TextStyle(color: status.color, fontSize: 11.5, fontWeight: FontWeight.w900)),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (order.location.isNotEmpty)
                      _Line(icon: Icons.location_on_rounded, text: order.location, maxLines: 2),
                    if (order.dueDate != null)
                      _Line(
                        icon: overdue ? Icons.warning_rounded : Icons.timer_rounded,
                        text: 'Muddat: ${formatDateUz(order.dueDate!)} · ${formatDaysLeftUz(order.dueDate!)}',
                        color: overdue ? AppColors.danger : null,
                      ),
                    if (order.totalPrice > 0) _Line(icon: Icons.payments_rounded, text: formatMoneyUz(order.totalPrice), strong: true),
                    const SizedBox(height: 8),
                    const Text('Jamoa', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.grayDark)),
                    const SizedBox(height: 6),
                    if (order.assignedTeam.isEmpty)
                      const Text("Jamoa hali biriktirilmagan", style: TextStyle(fontSize: 13, color: AppColors.danger, fontWeight: FontWeight.w700))
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final id in order.assignedTeam)
                            Container(
                              padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
                              decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(24)),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  EmployeeAvatar(name: staff?[id]?.fullName ?? '?', size: 28),
                                  const SizedBox(width: 8),
                                  ConstrainedBox(
                                    constraints: const BoxConstraints(maxWidth: 190),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          staff?[id]?.fullName ?? 'Xodim',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.ink),
                                        ),
                                        if ((staff?[id]?.roleLine ?? '').isNotEmpty)
                                          Text(
                                            staff![id]!.roleLine,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontSize: 11, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    const SizedBox(height: 10),
                    TariffDots(order: order),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color? color;
  final bool strong;
  final int maxLines;

  const _Line({required this.icon, required this.text, this.color, this.strong = false, this.maxLines = 1});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color ?? AppColors.gray),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              maxLines: maxLines,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: strong ? 14 : 13,
                fontWeight: strong ? FontWeight.w900 : FontWeight.w600,
                color: color ?? (strong ? AppColors.ink : AppColors.grayDark),
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
              child: const Icon(Icons.home_repair_service_rounded, size: 34, color: AppColors.primary),
            ),
            const SizedBox(height: 14),
            const Text(
              "Sizga biriktirilgan joyida yuvish buyurtmasi yo'q",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
            const SizedBox(height: 6),
            const Text(
              "Sotuv menejeri sizni jamoaga qo'shsa, buyurtma shu yerda paydo bo'ladi.",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.grayDark),
            ),
          ],
        ),
      ),
    );
  }
}

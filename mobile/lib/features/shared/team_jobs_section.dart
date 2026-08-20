import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import 'team_job_detail_sheet.dart';

/// Joyida-yuvish jamoasiga biriktirilgan buyurtmalar banneri — Ishchi/
/// Dastavchik/Sifat nazorati panellarining tepasida, agar xodimga shunday
/// buyurtma(lar) biriktirilgan bo'lsa ko'rinadi. Gorizontal skroll qatorida
/// — nechta buyurtma bo'lishidan qat'iy nazar barchasi ko'rinadi (avval
/// vertikal ro'yxat sifatida edi, ko'p buyurtma bo'lganda bannerni haddan
/// tashqari cho'zib, ekran balandligidan oshib ketishi mumkin edi).
class TeamJobsSection extends ConsumerWidget {
  const TeamJobsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claimsAsync = ref.watch(employeeClaimsProvider);
    final employeeId = claimsAsync.value?.employeeId;
    if (employeeId == null) return const SizedBox.shrink();

    final ordersAsync = ref.watch(myTeamOrdersProvider(employeeId));

    return ordersAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (orders) {
        if (orders.isEmpty) return const SizedBox.shrink();

        return Container(
          margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          padding: const EdgeInsets.only(top: 14, bottom: 14),
          decoration: BoxDecoration(gradient: heroGradient, borderRadius: BorderRadius.circular(18)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  children: [
                    const Icon(Icons.groups_rounded, color: Colors.white, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      "Joyida yuvish jamoasi — ${orders.length} ta buyurtma",
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 112,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  itemCount: orders.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, i) {
                    final order = orders[i];
                    return _TeamOrderCard(order: order, onTap: () => openTeamJobDetailSheet(context, order));
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TeamOrderCard extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;
  const _TeamOrderCard({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          width: 210,
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '#${order.orderNumber} — ${order.customerName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13.5),
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: Colors.white70, size: 16),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(20)),
                child: Text(
                  statusOf(order.status).label,
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.event_available_rounded, size: 12, color: Colors.white70),
                      const SizedBox(width: 4),
                      Text(
                        'Qabul: ${formatDateUz(order.createdAt)}',
                        style: const TextStyle(color: Colors.white70, fontSize: 10.5, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  if (order.dueDate != null) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(
                          Icons.timer_rounded,
                          size: 12,
                          color: order.isOverdue ? AppColors.accent : Colors.white70,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          formatDaysLeftUz(order.dueDate!),
                          style: TextStyle(
                            color: order.isOverdue ? AppColors.accent : Colors.white70,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

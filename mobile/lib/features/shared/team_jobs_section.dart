import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import 'team_job_detail_sheet.dart';

/// Joyida-yuvish jamoasiga biriktirilgan buyurtmalar banneri (talab #14) —
/// Ishchi/Dastavchik/Sifat nazorati panellarining tepasida, agar xodimga
/// shunday buyurtma biriktirilgan bo'lsa ko'rinadi.
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
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(gradient: heroGradient, borderRadius: BorderRadius.circular(18)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.groups_rounded, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    "Joyida yuvish jamoasi — ${orders.length} ta buyurtma",
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              for (final order in orders)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Material(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => openTeamJobDetailSheet(context, order),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                '#${order.orderNumber} — ${order.customerName}',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
                              ),
                            ),
                            Text(statusOf(order.status).label, style: const TextStyle(color: Colors.white, fontSize: 12)),
                            const SizedBox(width: 4),
                            const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 18),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

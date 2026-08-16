import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/team_jobs_section.dart';
import 'worker_order_detail_sheet.dart';

const _workerStages = ['brought_in', 'washing', 'packing'];

/// Ishchi paneli — talab: brought_in -> washing -> packing -> qc_review
/// pipeline'ini boshqaradi. Faqat "Olib kelish" xizmat turidagi
/// buyurtmalar bilan ishlaydi (joyida-yuvish alohida jamoa oqimi).
class WorkerHomeScreen extends ConsumerStatefulWidget {
  const WorkerHomeScreen({super.key});

  @override
  ConsumerState<WorkerHomeScreen> createState() => _WorkerHomeScreenState();
}

class _WorkerHomeScreenState extends ConsumerState<WorkerHomeScreen> {
  String _stage = 'brought_in';

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(recentOrdersProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Ishchi'),
            Text(fullName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.grayDark)),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () async {
              await ref.read(authServiceProvider).logout();
              if (context.mounted) context.go('/select');
            },
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Chiqish',
          ),
        ],
      ),
      body: Column(
        children: [
          const TeamJobsSection(),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                for (final stage in _workerStages) ...[
                  _StageChip(
                    label: kStatusConfig[stage]!.label,
                    selected: _stage == stage,
                    color: kStatusConfig[stage]!.color,
                    onTap: () => setState(() => _stage = stage),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          Expanded(
            child: ordersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                final filtered = orders.where((o) => o.serviceType == 'pickup' && o.status == _stage).toList()
                  ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (filtered.isEmpty) {
                  return const Center(
                    child: Text('Bu bosqichda buyurtma yo\'q', style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final order = filtered[i];
                    return OrderCard(order: order, onTap: () => openWorkerOrderDetailSheet(context, order));
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StageChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _StageChip({required this.label, required this.selected, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? color : AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: selected ? color : AppColors.border)),
          child: Text(label, style: TextStyle(color: selected ? Colors.white : AppColors.ink, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ),
      ),
    );
  }
}

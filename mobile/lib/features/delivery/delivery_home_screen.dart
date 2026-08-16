import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/confirm_logout.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/team_jobs_section.dart';
import 'delivery_order_detail_sheet.dart';

/// Dastavchik paneli — olib ketish (new -> picked_up -> brought_in) va
/// yetkazib berish (ready -> done) bosqichlarini boshqaradi.
class DeliveryHomeScreen extends ConsumerStatefulWidget {
  const DeliveryHomeScreen({super.key});

  @override
  ConsumerState<DeliveryHomeScreen> createState() => _DeliveryHomeScreenState();
}

class _DeliveryHomeScreenState extends ConsumerState<DeliveryHomeScreen> {
  String _stage = 'new';

  static const _stages = [
    ('new', 'Yangi'),
    ('picked_up', 'Olib ketilgan'),
    ('ready', 'Yetkazishga tayyor'),
  ];

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
            const Text('Dastavchik'),
            Text(fullName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.grayDark)),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => confirmLogout(context, ref),
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
                for (final (stage, label) in _stages) ...[
                  _StageChip(label: label, selected: _stage == stage, onTap: () => setState(() => _stage = stage)),
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
                    child: Text('Bu bo\'limda buyurtma yo\'q', style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final order = filtered[i];
                    return OrderCard(order: order, onTap: () => openDeliveryOrderDetailSheet(context, order));
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
  final VoidCallback onTap;

  const _StageChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: selected ? AppColors.primary : AppColors.border)),
          child: Text(label, style: TextStyle(color: selected ? Colors.white : AppColors.ink, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ),
      ),
    );
  }
}

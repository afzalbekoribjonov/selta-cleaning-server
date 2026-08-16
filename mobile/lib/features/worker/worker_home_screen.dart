import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/confirm_logout.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/team_jobs_section.dart';
import 'worker_order_detail_sheet.dart';

const _returnedStage = 'returned';

const _stageIcons = {
  'brought_in': Icons.inventory_2_rounded,
  'washing': Icons.local_laundry_service_rounded,
  'packing': Icons.inventory_rounded,
  _returnedStage: Icons.replay_rounded,
};
const _stageLabels = {
  'brought_in': 'Sexga keldi',
  'washing': 'Yuvilmoqda',
  'packing': 'Upakovka',
  _returnedStage: 'Qaytarilgan',
};
const _workerStages = ['brought_in', 'washing', 'packing', _returnedStage];

/// Ishchi paneli — talab: brought_in -> washing -> packing -> qc_review
/// pipeline'ini boshqaradi. Faqat "Olib kelish" xizmat turidagi
/// buyurtmalar bilan ishlaydi (joyida-yuvish alohida jamoa oqimi).
class WorkerHomeScreen extends ConsumerStatefulWidget {
  const WorkerHomeScreen({super.key});

  @override
  ConsumerState<WorkerHomeScreen> createState() => _WorkerHomeScreenState();
}

class _WorkerHomeScreenState extends ConsumerState<WorkerHomeScreen> {
  int _stageIndex = 0;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(recentOrdersProvider);
    final stage = _workerStages[_stageIndex];

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
            onPressed: () => confirmLogout(context, ref),
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Chiqish',
          ),
        ],
      ),
      body: Column(
        children: [
          const TeamJobsSection(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Ism, telefon yoki # bo\'yicha qidirish',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                isDense: true,
                filled: true,
                fillColor: AppColors.surface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
              ),
            ),
          ),
          Expanded(
            child: ordersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                var filtered = orders
                    .where((o) => o.serviceType == 'pickup' && (stage == _returnedStage ? (o.status == 'qc_review' && o.hasFailedItem) : o.status == stage))
                    .toList();

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }

                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      stage == _returnedStage ? 'Qaytarilgan mahsulot yo\'q' : 'Bu bosqichda buyurtma yo\'q',
                      style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
                    ),
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
      bottomNavigationBar: ordersAsync.when(
        loading: () => null,
        error: (_, __) => null,
        data: (orders) {
          final pickupOrders = orders.where((o) => o.serviceType == 'pickup').toList();
          int countFor(String s) => s == _returnedStage
              ? pickupOrders.where((o) => o.status == 'qc_review' && o.hasFailedItem).length
              : pickupOrders.where((o) => o.status == s).length;

          return NavigationBar(
            selectedIndex: _stageIndex,
            onDestinationSelected: (i) => setState(() => _stageIndex = i),
            destinations: [
              for (final s in _workerStages)
                NavigationDestination(
                  icon: _BadgedIcon(icon: _stageIcons[s]!, count: countFor(s)),
                  label: _stageLabels[s]!,
                ),
            ],
          );
        },
      ),
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  final IconData icon;
  final int count;
  const _BadgedIcon({required this.icon, required this.count});

  @override
  Widget build(BuildContext context) {
    if (count == 0) return Icon(icon);
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      backgroundColor: AppColors.danger,
      child: Icon(icon),
    );
  }
}

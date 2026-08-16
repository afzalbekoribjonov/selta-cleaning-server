import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/confirm_logout.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/team_jobs_section.dart';
import 'delivery_order_detail_sheet.dart';

const _stages = [
  ('new', 'Yangi', Icons.move_to_inbox_rounded),
  ('picked_up', 'Olib ketilgan', Icons.local_shipping_rounded),
  ('ready', 'Yetkazishga tayyor', Icons.done_all_rounded),
];

/// Dastavchik paneli — olib ketish (new -> picked_up -> brought_in) va
/// yetkazib berish (ready -> done) bosqichlarini boshqaradi.
class DeliveryHomeScreen extends ConsumerStatefulWidget {
  const DeliveryHomeScreen({super.key});

  @override
  ConsumerState<DeliveryHomeScreen> createState() => _DeliveryHomeScreenState();
}

class _DeliveryHomeScreenState extends ConsumerState<DeliveryHomeScreen> {
  int _stageIndex = 0;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(recentOrdersProvider);
    final stage = _stages[_stageIndex].$1;

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
                var filtered = orders.where((o) => o.serviceType == 'pickup' && o.status == stage).toList();

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

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
      bottomNavigationBar: ordersAsync.when(
        loading: () => null,
        error: (_, __) => null,
        data: (orders) {
          final pickupOrders = orders.where((o) => o.serviceType == 'pickup').toList();
          return NavigationBar(
            selectedIndex: _stageIndex,
            onDestinationSelected: (i) => setState(() => _stageIndex = i),
            destinations: [
              for (final (s, label, icon) in _stages)
                NavigationDestination(
                  icon: _BadgedIcon(icon: icon, count: pickupOrders.where((o) => o.status == s).length),
                  label: label,
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

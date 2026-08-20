import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show authStateProvider;
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';
import '../shared/employee_app_bar.dart';
import '../shared/item_action_row.dart';
import '../shared/team_jobs_section.dart';
import 'worker_order_detail_sheet.dart';

const _workerStages = ['pending', 'washing', 'packing', 'returned'];
const _stageIcons = {
  'pending': Icons.hourglass_empty_rounded,
  'washing': Icons.local_laundry_service_rounded,
  'packing': Icons.inventory_rounded,
  'returned': Icons.replay_rounded,
};

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

typedef _OrderItemPair = ({Order order, OrderItem item});

/// Ishchi paneli — talab #3/#5/#8/#10: har bir mahsulot mustaqil ravishda
/// pending -> washing -> packing -> ready/returned bosqichlaridan o'tadi.
/// "Sifat nazorati" bo'limi olib tashlangan — "packing" bosqichida
/// istalgan ishchi ✅/❌ bosa oladi. "pending"/"washing" bosqichlarida
/// xodim faqat o'z mutaxassisligiga mos mahsulotlarni ko'radi (talab #6),
/// "packing"/"returned"da esa hammaga ochiq.
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
    final specializations =
        (employeeAsync.value?['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    final ordersAsync = ref.watch(recentOrdersProvider);
    final stage = _workerStages[_stageIndex];

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Ishchi', employeeName: fullName),
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
              loading: () => const SeltaLoadingView(),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                final activeOrders = orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in').toList();
                final pairs = _watchAllItems(ref, activeOrders);
                var filtered = _forStage(pairs, stage, specializations);

                if (_search.isNotEmpty) {
                  filtered = filtered.where((p) {
                    return p.order.customerName.toLowerCase().contains(_search) ||
                        p.order.phone.toLowerCase().contains(_search) ||
                        p.order.orderNumber.toString().contains(_search);
                  }).toList();
                }

                filtered.sort((a, b) {
                  final ca = a.item.createdAt;
                  final cb = b.item.createdAt;
                  if (ca == null || cb == null) return 0;
                  return ca.compareTo(cb);
                });

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      stage == 'returned' ? "Qaytarilgan mahsulot yo'q" : 'Bu bosqichda mahsulot yo\'q',
                      style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 4),
                  itemBuilder: (context, i) {
                    final pair = filtered[i];
                    return _WorkerItemCard(pair: pair);
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
          final activeOrders = orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in').toList();
          final pairs = _watchAllItems(ref, activeOrders);

          return NavigationBar(
            selectedIndex: _stageIndex,
            onDestinationSelected: (i) => setState(() => _stageIndex = i),
            destinations: [
              for (final s in _workerStages)
                NavigationDestination(
                  icon: _BadgedIcon(icon: _stageIcons[s]!, count: _forStage(pairs, s, specializations).length),
                  label: kStatusConfig[s]!.label,
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Barcha faol buyurtmalarning item'larini birlashtirib (order, item)
/// juftliklariga aylantiradi — har bir buyurtma o'z items subkolleksiyasi
/// orqali alohida kuzatiladi (collection-group so'rov emas, qo'shimcha
/// xavfsizlik qoidasi shart emas).
List<_OrderItemPair> _watchAllItems(WidgetRef ref, List<Order> orders) {
  final pairs = <_OrderItemPair>[];
  for (final order in orders) {
    final items = ref.watch(_itemsProvider(order.id)).valueOrNull ?? const <OrderItem>[];
    for (final item in items) {
      pairs.add((order: order, item: item));
    }
  }
  return pairs;
}

List<_OrderItemPair> _forStage(List<_OrderItemPair> pairs, String stage, List<String> specializations) {
  final restrictBySpecialization = stage == 'pending' || stage == 'washing';
  return pairs.where((p) {
    if (p.item.status != stage) return false;
    if (restrictBySpecialization && specializations.isNotEmpty) {
      return p.item.category == null || specializations.contains(p.item.category);
    }
    return true;
  }).toList();
}

class _WorkerItemCard extends StatelessWidget {
  final _OrderItemPair pair;
  const _WorkerItemCard({required this.pair});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => openWorkerOrderDetailSheet(context, pair.order),
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '#${pair.order.orderNumber} — ${pair.order.customerName}',
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.grayDark),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            ItemActionRow(order: pair.order, item: pair.item),
          ],
        ),
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

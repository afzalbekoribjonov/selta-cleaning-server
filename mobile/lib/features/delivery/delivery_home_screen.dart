import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show authStateProvider;
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/launch_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_jobs_section.dart';
import 'delivery_order_detail_sheet.dart';

const _stages = [
  ('new', 'Yangi', Icons.move_to_inbox_rounded),
  ('picked_up', 'Qabul qilindi', Icons.local_shipping_rounded),
  ('ready', 'Yetkazishga tayyor', Icons.done_all_rounded),
];

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

/// "Yetkazishga tayyor" endi order-level status emas — har bir item
/// mustaqil ravishda "ready"ga yetadi (talab #9). Shu bosqichdagi
/// buyurtmalar — "brought_in"da turgan VA kamida bitta "ready" itemga
/// ega bo'lganlar.
bool _hasReadyItem(WidgetRef ref, Order order) {
  final items = ref.watch(_itemsProvider(order.id)).valueOrNull ?? const <OrderItem>[];
  return items.any((i) => i.status == 'ready');
}

/// Dastavchik paneli — olib ketish (new -> picked_up -> brought_in)
/// bosqichini boshqaradi; yetkazib berish endi ITEM-darajasida (talab
/// #9: qisman yetkazish) — "Yetkazishga tayyor" tabida kamida bitta
/// "ready" itemga ega buyurtmalar ko'rsatiladi.
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
      appBar: EmployeeAppBar(departmentLabel: 'Dastavchik', employeeName: fullName),
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
                var filtered = stage == 'ready'
                    ? orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in' && _hasReadyItem(ref, o)).toList()
                    : orders.where((o) => o.serviceType == 'pickup' && o.status == stage).toList();

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                // Talab #11: buyurtma raqami bo'yicha qidiruv joriy tabga
                // cheklanmasin.
                final searchNumber = RegExp(r'^\d+$').hasMatch(_search) ? int.tryParse(_search) : null;
                if (filtered.isEmpty && searchNumber != null) {
                  final elsewhere = orders.where((o) => o.orderNumber == searchNumber && o.serviceType == 'pickup').toList();
                  if (elsewhere.isNotEmpty) {
                    return ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: Text('Boshqa bosqichda topildi', style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w700, fontSize: 12.5)),
                        ),
                        for (final order in elsewhere) ...[
                          OrderCard(order: order, onTap: () => openDeliveryOrderDetailSheet(context, order)),
                          const SizedBox(height: 10),
                        ],
                      ],
                    );
                  }
                }

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
                    return OrderCard(
                      order: order,
                      onTap: () => openDeliveryOrderDetailSheet(context, order),
                      emphasizePrice: stage == 'ready',
                      actions: [
                        CardActionButton(icon: Icons.call_rounded, label: "Qo'ng'iroq", onTap: () => callPhone(order.phone)),
                        if (stage == 'ready' && order.gpsCoords != null && order.gpsCoords!.isNotEmpty)
                          CardActionButton(icon: Icons.navigation_rounded, label: "Yo'lga chiqish", filled: true, onTap: () => navigateToGps(order.gpsCoords!)),
                      ],
                    );
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
          final broughtIn = pickupOrders.where((o) => o.status == 'brought_in').toList();
          int countFor(String s) =>
              s == 'ready' ? broughtIn.where((o) => _hasReadyItem(ref, o)).length : pickupOrders.where((o) => o.status == s).length;
          return NavigationBar(
            selectedIndex: _stageIndex,
            onDestinationSelected: (i) => setState(() => _stageIndex = i),
            destinations: [
              for (final (s, label, icon) in _stages) NavigationDestination(icon: _BadgedIcon(icon: icon, count: countFor(s)), label: label),
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

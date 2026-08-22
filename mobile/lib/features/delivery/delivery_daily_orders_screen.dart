import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import 'delivery_daily_stats.dart';
import 'delivery_order_detail_sheet.dart';

/// "Ularni ko'rish" sahifasi — bitta kunga tegishli, shu dastavchining
/// o'zi olib kelgan/yetkazgan buyurtmalari, filter orqali almashtirib
/// ko'riladi. Karta bosilgach ochiladigan sheet (openDeliveryOrderDetailSheet)
/// allaqachon tahrirlash/izoh/mahsulot qo'shish imkoniyatlarini beradi —
/// shu yerda alohida qayta qurilmaydi.
void openDeliveryDailyOrdersScreen(BuildContext context, {required DateTime day, required String initialFilter}) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (context) => DeliveryDailyOrdersScreen(day: day, initialFilter: initialFilter),
    ),
  );
}

class DeliveryDailyOrdersScreen extends ConsumerStatefulWidget {
  final DateTime day;
  final String initialFilter; // 'picked_up' | 'delivered'

  const DeliveryDailyOrdersScreen({super.key, required this.day, required this.initialFilter});

  @override
  ConsumerState<DeliveryDailyOrdersScreen> createState() => _DeliveryDailyOrdersScreenState();
}

class _DeliveryDailyOrdersScreenState extends ConsumerState<DeliveryDailyOrdersScreen> {
  late String _filter = widget.initialFilter;

  @override
  Widget build(BuildContext context) {
    final claims = ref.watch(employeeClaimsProvider).valueOrNull;
    final ordersAsync = ref.watch(recentOrdersProvider);

    return Scaffold(
      appBar: AppBar(title: Text(formatDateUz(widget.day))),
      body: claims == null
          ? const SeltaLoadingView()
          : ordersAsync.when(
              loading: () => const SeltaLoadingView(),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                final stats = computeDeliveryDayStats(ref, orders, claims.employeeId, widget.day);
                final list = _filter == 'picked_up' ? stats.pickedUpOrders : stats.deliveredOrders;

                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: _FilterChip(
                              label: 'Olib kelindi',
                              selected: _filter == 'picked_up',
                              onTap: () => setState(() => _filter = 'picked_up'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _FilterChip(
                              label: 'Yetgazildi',
                              selected: _filter == 'delivered',
                              onTap: () => setState(() => _filter = 'delivered'),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: list.isEmpty
                          ? const Center(
                              child: Text("Bu bo'limda buyurtma yo'q", style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                              itemCount: list.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (context, i) {
                                final order = list[i];
                                return OrderCard(order: order, onTap: () => openDeliveryOrderDetailSheet(context, order));
                              },
                            ),
                    ),
                  ],
                );
              },
            ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? AppColors.primary : AppColors.border),
          ),
          child: Text(
            label,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: selected ? Colors.white : AppColors.ink),
          ),
        ),
      ),
    );
  }
}

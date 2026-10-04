import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/warehouse_settings.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../delivery/delivery_buckets.dart';
import '../delivery/delivery_order_detail_sheet.dart';
import '../dispatcher/widgets/order_card.dart';

/// Omborxona — barcha mahsulotlari tayyor bo'lib, muddatidan uzoq o'tib
/// ketgan (mijoz olib ketmagan) buyurtmalar.
///
/// Ro'yxat buyurtma xulosasidan hisoblanadi — qo'shimcha o'qish yo'q.
/// Buyurtma bosilsa topshirish oynasi ochiladi: dastavchik yetkazib
/// beradi yoki mijoz o'zi kelganda vakolatli xodim topshiradi (to'lov
/// odatdagidek naqd/karta bilan qayd etiladi). Topshirilgach ombordan
/// o'z-o'zidan chiqadi.
///
/// Faqat "Omborxona" vakolati berilgan xodimlarga ko'rinadi (⋮ menyu).
class WarehouseScreen extends ConsumerStatefulWidget {
  const WarehouseScreen({super.key});

  @override
  ConsumerState<WarehouseScreen> createState() => _WarehouseScreenState();
}

class _WarehouseScreenState extends ConsumerState<WarehouseScreen> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final threshold = ref.warehouseThreshold;
    final ordersAsync = ref.watch(ordersProvider);
    final now = DateTime.now();

    final all = (ordersAsync.valueOrNull ?? const <Order>[]).where((o) => isInWarehouse(o, threshold, now)).toList()
      // Eng uzoq turgani birinchi — u eng shoshilinch.
      ..sort((a, b) => daysLate(b, now).compareTo(daysLate(a, now)));
    final shown = _search.isEmpty
        ? all
        : all
            .where((o) =>
                o.customerName.toLowerCase().contains(_search) ||
                o.phone.contains(_search) ||
                o.orderNumber.toString().contains(_search))
            .toList();
    final total = all.fold<num>(0, (s, o) => s + o.totalPrice);

    return Scaffold(
      appBar: AppBar(title: const Text('Omborxona')),
      body: Column(
        children: [
          Container(
            margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(gradient: primaryGradient, borderRadius: BorderRadius.circular(18)),
            child: Row(
              children: [
                const Icon(Icons.warehouse_rounded, color: Colors.white, size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${all.length} ta buyurtma · ${formatMoneyUz(total)}',
                        style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        "Hammasi tayyor, muddatidan $threshold kundan ko'p o'tgan",
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Ombordan: ism, telefon yoki #',
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
            child: ordersAsync.isLoading && !ordersAsync.hasValue
                ? const SeltaLoadingView()
                : shown.isEmpty
                    ? Center(
                        child: Text(
                          all.isEmpty ? "Omborda buyurtma yo'q" : 'Topilmadi',
                          style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final order = shown[i];
                          return OrderCard(
                            order: order,
                            onTap: () => openDeliveryOrderDetailSheet(context, order),
                            facts: [
                              CardFact(
                                Icons.warehouse_rounded,
                                'Omborda · ${daysLate(order, now)} kun kechikdi',
                                color: AppColors.danger,
                                strong: true,
                              ),
                              CardFact(Icons.payments_rounded, "Yig'ish: ${formatMoneyUz(order.totalPrice)}"),
                            ],
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

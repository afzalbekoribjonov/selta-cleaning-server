import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/order_items_provider.dart' show effectiveDueDate;

/// Buyurtma kartalarini saralash va kartadagi tarif ko'rsatkichlari —
/// barcha bo'limlarda bir xil.
///
/// Tarif ustuvorligi (talab): Premium va Express topshirish muddati bir xil,
/// lekin Premium ustunroq; Comfort va Standart muddati bo'yicha keyin keladi.
const kTariffRank = {'premium': 0, 'express': 1, 'comfort': 2, 'standart': 3};
const kTariffOrder = ['premium', 'express', 'comfort', 'standart'];

String _normalizeTariff(String? t) {
  final v = (t ?? '').toLowerCase();
  return v == 'standard' ? 'standart' : v;
}

/// Buyurtmadagi mahsulotlar soni tarif bo'yicha: {premium: 1, express: 2}.
/// Faol buyurtmada — hali topshirilmaganlari, yakunlanganda — hammasi.
/// Mahsulotsiz joyida yuvishda — buyurtmaning o'z tarifi (soni 0).
Map<String, int> tariffCountsOf(Order o) {
  final counts = <String, int>{};
  final items = o.itemsMirror ?? const [];
  for (final i in items) {
    if (!o.isDone && i.status == 'done') continue;
    final t = _normalizeTariff(i.tariff ?? o.tariff);
    if (!kTariffRank.containsKey(t)) continue;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  if (counts.isEmpty && items.isEmpty) {
    final t = _normalizeTariff(o.tariff);
    if (kTariffRank.containsKey(t)) counts[t] = 0;
  }
  return counts;
}

/// Buyurtmaning eng ustun tarifi darajasi (Premium = 0); tarifsiz — oxirida.
int bestTariffRank(Order o) {
  var best = 99;
  for (final t in tariffCountsOf(o).keys) {
    final r = kTariffRank[t] ?? 99;
    if (r < best) best = r;
  }
  return best;
}

enum OrderSort { tariff, newest, oldest, priceHigh, priceLow }

const kOrderSortLabels = {
  OrderSort.tariff: 'Tarif bo\'yicha',
  OrderSort.newest: 'Eng yangi',
  OrderSort.oldest: 'Eng eski',
  OrderSort.priceHigh: 'Eng qimmat',
  OrderSort.priceLow: 'Eng arzon',
};

const kOrderSortIcons = {
  OrderSort.tariff: Icons.workspace_premium_rounded,
  OrderSort.newest: Icons.south_rounded,
  OrderSort.oldest: Icons.north_rounded,
  OrderSort.priceHigh: Icons.trending_up_rounded,
  OrderSort.priceLow: Icons.trending_down_rounded,
};

/// Tarif bo'yicha: Premium → Express → Comfort → Standart, bir xil tarifda —
/// muddati yaqini, so'ng eng eskisi birinchi.
int compareByTariff(Order a, Order b) {
  final byRank = bestTariffRank(a).compareTo(bestTariffRank(b));
  if (byRank != 0) return byRank;
  final da = effectiveDueDate(a);
  final db = effectiveDueDate(b);
  if (da != null && db != null && da != db) return da.compareTo(db);
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return a.createdAt.compareTo(b.createdAt);
}

List<Order> sortOrders(Iterable<Order> orders, OrderSort sort) {
  final list = [...orders];
  switch (sort) {
    case OrderSort.tariff:
      list.sort(compareByTariff);
    case OrderSort.newest:
      list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    case OrderSort.oldest:
      list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    case OrderSort.priceHigh:
      list.sort((a, b) => b.totalPrice.compareTo(a.totalPrice) == 0 ? b.createdAt.compareTo(a.createdAt) : b.totalPrice.compareTo(a.totalPrice));
    case OrderSort.priceLow:
      list.sort((a, b) => a.totalPrice.compareTo(b.totalPrice) == 0 ? b.createdAt.compareTo(a.createdAt) : a.totalPrice.compareTo(b.totalPrice));
  }
  return list;
}

/// Ixcham saralash tugmasi: "↕ Tarif bo'yicha ▾" — bosilganda ro'yxat.
class OrderSortButton extends StatelessWidget {
  final OrderSort value;
  final ValueChanged<OrderSort> onChanged;
  final List<OrderSort> options;

  const OrderSortButton({super.key, required this.value, required this.onChanged, this.options = OrderSort.values});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<OrderSort>(
      tooltip: 'Saralash',
      initialValue: value,
      onSelected: onChanged,
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      itemBuilder: (_) => [
        for (final s in options)
          PopupMenuItem(
            value: s,
            height: 44,
            child: Row(
              children: [
                Icon(kOrderSortIcons[s], size: 18, color: s == value ? AppColors.primary : AppColors.grayDark),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    kOrderSortLabels[s]!,
                    style: TextStyle(fontWeight: s == value ? FontWeight.w800 : FontWeight.w600, color: AppColors.ink),
                  ),
                ),
                if (s == value) const Icon(Icons.check_rounded, size: 18, color: AppColors.primary),
              ],
            ),
          ),
      ],
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.swap_vert_rounded, size: 17, color: AppColors.primary),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                kOrderSortLabels[value]!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
            ),
            const Icon(Icons.expand_more_rounded, size: 18, color: AppColors.grayDark),
          ],
        ),
      ),
    );
  }
}

/// Kartaning eng pastidagi tarif ko'rsatkichlari: rangli dumaloq va soni.
class TariffDots extends StatelessWidget {
  final Order order;
  const TariffDots({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final counts = tariffCountsOf(order);
    if (counts.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final t in kTariffOrder)
          if (counts.containsKey(t))
            Tooltip(
              message: tariffOf(t).label,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: tariffOf(t).color,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: tariffOf(t).color.withValues(alpha: 0.35), blurRadius: 4)],
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    counts[t]! > 0 ? '${counts[t]}' : tariffOf(t).label,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: tariffOf(t).color),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

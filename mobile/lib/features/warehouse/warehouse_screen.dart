import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/warehouse_settings.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/launch_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import '../../core/widgets/filter_pill.dart';
import '../../core/widgets/selta_loader.dart';
import '../delivery/delivery_buckets.dart';
import '../delivery/delivery_order_detail_sheet.dart';
import '../shared/item_detail_row.dart' show itemMeasurementLabel;

/// Omborxona — "Tayyor" bo'lganiga [warehouseReadyDays] kun bo'lgan (mijoz
/// olib ketmagan) mahsulotlar. Har bir mahsulot ALOHIDA omborga tushadi:
/// bitta buyurtmaning 3 mahsulotidan faqat eskisi omborda bo'lishi mumkin.
///
/// Ko'rinish mijoz bo'yicha guruhlangan (bitta mijozning mahsulotlari
/// birga topshiriladi), lekin har bir mahsulot o'z qatori, o'z raqami
/// (#12/3) va necha kundan beri turgani bilan — omborchi aynan qaysi
/// mahsulotni ko'chirish/topishni ko'radi.
///
/// Ro'yxat buyurtmadagi mahsulotlar nusxasidan hisoblanadi — qo'shimcha
/// o'qish yo'q. "Topshirish" odatdagi topshirish oynasini ochadi; mahsulot
/// topshirilishi bilan ombordan o'z-o'zidan chiqadi.
///
/// Faqat "Omborxona" vakolati berilgan xodimlarga ko'rinadi (⋮ menyu).
class WarehouseScreen extends ConsumerStatefulWidget {
  const WarehouseScreen({super.key});

  @override
  ConsumerState<WarehouseScreen> createState() => _WarehouseScreenState();
}

/// Necha kundan beri turgani bo'yicha guruh — chegara sozlamaga nisbatan.
enum _Age { all, fresh, long, veryLong }

class _Group {
  final Order order;
  final List<OrderItem> items;

  /// Shu buyurtmaning hali yetkazilmagan, lekin omborga tushmagan mahsulotlari.
  final int otherRemaining;
  final int oldestDays;

  const _Group({required this.order, required this.items, required this.otherRemaining, required this.oldestDays});

  num get value => items.fold<num>(0, (s, i) => s + i.price);
}

class _WarehouseScreenState extends ConsumerState<WarehouseScreen> {
  String _search = '';
  _Age _age = _Age.all;

  _Age _ageOf(int days, int threshold) {
    if (days >= threshold * 6) return _Age.veryLong;
    if (days >= threshold * 2) return _Age.long;
    return _Age.fresh;
  }

  @override
  Widget build(BuildContext context) {
    final threshold = ref.warehouseReadyDays;
    final ordersAsync = ref.watch(ordersProvider);
    final now = DateTime.now();

    final groups = <_Group>[];
    for (final o in ordersAsync.valueOrNull ?? const <Order>[]) {
      final items = warehouseItemsOf(o, threshold, now);
      if (items.isEmpty) continue;
      groups.add(_Group(
        order: o,
        items: items,
        otherRemaining: remainingItems(o) - items.length,
        oldestDays: readyDays(items.first, now) ?? threshold,
      ));
    }
    // Eng uzoq turgani birinchi — u eng shoshilinch.
    groups.sort((a, b) => b.oldestDays.compareTo(a.oldestDays));

    final counts = {for (final a in _Age.values) a: 0};
    for (final g in groups) {
      for (final i in g.items) {
        counts[_Age.all] = counts[_Age.all]! + 1;
        final age = _ageOf(readyDays(i, now) ?? threshold, threshold);
        counts[age] = counts[age]! + 1;
      }
    }
    final totalValue = groups.fold<num>(0, (s, g) => s + g.value);

    final q = _search;
    final qDigits = q.replaceAll(RegExp(r'\D'), '');
    bool matches(_Group g) {
      final o = g.order;
      return o.customerName.toLowerCase().contains(q) ||
          (qDigits.length >= 3 && o.phone.replaceAll(RegExp(r'\D'), '').contains(qDigits)) ||
          '${o.orderNumber}'.contains(q.replaceAll('#', '')) ||
          g.items.any((i) => i.name.toLowerCase().contains(q) || i.subId(o.orderNumber).contains(q.replaceAll('#', '')));
    }

    final shown = <_Group>[];
    for (final g in groups) {
      final o = g.order;
      if (q.isNotEmpty && !matches(g)) continue;
      final items = _age == _Age.all ? g.items : g.items.where((i) => _ageOf(readyDays(i, now) ?? threshold, threshold) == _age).toList();
      if (items.isEmpty) continue;
      shown.add(_Group(order: o, items: items, otherRemaining: g.otherRemaining + (g.items.length - items.length), oldestDays: g.oldestDays));
    }

    final loading = ordersAsync.isLoading && !ordersAsync.hasValue;

    return Scaffold(
      appBar: AppBar(title: const Text('Omborxona')),
      body: loading
          ? const SeltaLoadingView()
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(ordersProvider),
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: _SummaryCard(
                      itemCount: counts[_Age.all]!,
                      customerCount: groups.length,
                      value: totalValue,
                      threshold: threshold,
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: TextField(
                        onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
                        textInputAction: TextInputAction.search,
                        decoration: const InputDecoration(
                          hintText: 'Mijoz, telefon, #raqam yoki mahsulot',
                          prefixIcon: Icon(Icons.search_rounded, size: 20),
                          isDense: true,
                        ),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: FilterPillBar(
                      children: [
                        for (final age in _Age.values)
                          FilterPill(
                            label: _ageLabel(age, threshold),
                            count: counts[age]!,
                            color: _ageColor(age),
                            selected: _age == age,
                            onTap: () => setState(() => _age = age),
                          ),
                      ],
                    ),
                  ),
                  if (shown.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: _EmptyState(
                        filtered: groups.isNotEmpty,
                        threshold: threshold,
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 28),
                      sliver: SliverList.separated(
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, i) => _GroupCard(
                          group: shown[i],
                          now: now,
                          threshold: threshold,
                          ageColorOf: (days) => _ageColor(_ageOf(days, threshold)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  static String _ageLabel(_Age age, int t) => switch (age) {
        _Age.all => 'Hammasi',
        _Age.fresh => '$t–${t * 2 - 1} kun',
        _Age.long => '${t * 2}–${t * 6 - 1} kun',
        _Age.veryLong => '${t * 6}+ kun',
      };

  static Color _ageColor(_Age age) => switch (age) {
        _Age.all => AppColors.primary,
        _Age.fresh => const Color(0xFFB7791F),
        _Age.long => const Color(0xFFDD6B20),
        _Age.veryLong => AppColors.danger,
      };
}

class _SummaryCard extends StatelessWidget {
  final int itemCount;
  final int customerCount;
  final num value;
  final int threshold;

  const _SummaryCard({required this.itemCount, required this.customerCount, required this.value, required this.threshold});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: primaryGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.22), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(11)),
                child: const Icon(Icons.warehouse_rounded, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  "Tayyor bo'lganiga $threshold kun va undan ko'p bo'lgan mahsulotlar",
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.86), fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.3),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _Stat(value: '$itemCount', label: 'mahsulot')),
              _divider(),
              Expanded(child: _Stat(value: '$customerCount', label: 'mijoz')),
              _divider(),
              Expanded(flex: 2, child: _Stat(value: formatMoneyUz(value), label: 'qiymati')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _divider() => Container(width: 1, height: 30, margin: const EdgeInsets.symmetric(horizontal: 10), color: Colors.white24);
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;
  const _Stat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900, height: 1.1)),
        ),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11.5, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _GroupCard extends StatelessWidget {
  final _Group group;
  final DateTime now;
  final int threshold;
  final Color Function(int days) ageColorOf;

  const _GroupCard({required this.group, required this.now, required this.threshold, required this.ageColorOf});

  @override
  Widget build(BuildContext context) {
    final o = group.order;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => openDeliveryOrderDetailSheet(context, o),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Mijoz
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 6, 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(children: [
                              TextSpan(
                                text: '#${o.orderNumber}  ',
                                style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w900),
                              ),
                              TextSpan(text: o.customerName.isEmpty ? "Noma'lum mijoz" : o.customerName),
                            ]),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.25),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            [if (o.phone.isNotEmpty) formatPhoneUz(o.phone), if (o.location.isNotEmpty) o.location].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                    if (o.phone.isNotEmpty)
                      IconButton(
                        tooltip: "Qo'ng'iroq qilish",
                        onPressed: () => callPhone(o.phone),
                        style: IconButton.styleFrom(backgroundColor: AppColors.success.withValues(alpha: 0.1)),
                        icon: const Icon(Icons.call_rounded, color: AppColors.success, size: 20),
                      ),
                  ],
                ),
              ),
              const Divider(height: 1),
              // Mahsulotlar — har biri alohida
              for (final item in group.items)
                _ItemRow(item: item, orderNumber: o.orderNumber, days: readyDays(item, now) ?? threshold, color: ageColorOf(readyDays(item, now) ?? threshold)),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 10, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        group.otherRemaining > 0
                            ? 'Yana ${group.otherRemaining} ta mahsuloti omborda emas'
                            : '${group.items.length} ta mahsulot · ${formatMoneyUz(group.value)}',
                        style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                      ),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: () => openDeliveryOrderDetailSheet(context, o),
                      style: FilledButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                      ),
                      icon: const Icon(Icons.local_shipping_rounded, size: 17),
                      label: const Text('Topshirish'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final OrderItem item;
  final int orderNumber;
  final int days;
  final Color color;

  const _ItemRow({required this.item, required this.orderNumber, required this.days, required this.color});

  @override
  Widget build(BuildContext context) {
    final measurement = itemMeasurementLabel(item);
    final since = readySince(item);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(7)),
            child: Text(
              item.subId(orderNumber),
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppColors.primary),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 1),
                Text(
                  [if (measurement.isNotEmpty) measurement, formatMoneyUz(item.price)].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Necha kundan beri va qachondan — o'ngda, ustma-ust (nom qatori
          // tor ekranda ham kesilmasin).
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                child: Text('$days kun', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900, color: color)),
              ),
              if (since != null) ...[
                const SizedBox(height: 3),
                Text(
                  'tayyor ${formatDateUz(since)}',
                  style: const TextStyle(fontSize: 10.5, color: AppColors.gray, fontWeight: FontWeight.w600),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final bool filtered;
  final int threshold;
  const _EmptyState({required this.filtered, required this.threshold});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
            child: Icon(filtered ? Icons.search_off_rounded : Icons.inventory_2_outlined, size: 34, color: AppColors.primary),
          ),
          const SizedBox(height: 14),
          Text(
            filtered ? 'Topilmadi' : "Omborda mahsulot yo'q",
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          const SizedBox(height: 6),
          Text(
            filtered
                ? "Qidiruv yoki filtrni o'zgartiring"
                : "Tayyor bo'lganiga $threshold kun bo'lgan va mijoz olib ketmagan mahsulotlar shu yerda alohida ko'rinadi",
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: AppColors.grayDark, height: 1.4),
          ),
        ],
      ),
    );
  }
}

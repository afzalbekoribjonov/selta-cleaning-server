import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/services/warehouse_settings.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/filter_pill.dart';
import '../delivery/delivery_buckets.dart' show isItemInWarehouse, readyDays;
import '../delivery/driver_tasks.dart' show isAssignmentOpen;
import '../shared/item_detail_row.dart' show itemMeasurementLabel;
import 'delivery_planning.dart';
import 'supervisor_workflow.dart' show orderMatchesQuery;

/// Dastavchikning bir kunlik topshirig'ini tuzish: qaysi buyurtmalar va
/// har biridan AYNAN qaysi mahsulotlar. Saqlanganda ro'yxat to'liq
/// almashtiriladi (olib tashlanganlari dastavchikdan ham olinadi).
class DeliveryPlannerScreen extends ConsumerStatefulWidget {
  final StaffMember driver;
  final String date;
  const DeliveryPlannerScreen({super.key, required this.driver, required this.date});

  @override
  ConsumerState<DeliveryPlannerScreen> createState() => _DeliveryPlannerScreenState();
}

class _DeliveryPlannerScreenState extends ConsumerState<DeliveryPlannerScreen> {
  /// Tanlangan buyurtmalar tanlangan tartibda (dastavchikning yo'l tartibi).
  final List<String> _order = [];

  /// Yetkazishda — tanlangan mahsulotlar; olib kelishda — bo'sh.
  final Map<String, Set<String>> _items = {};
  final _note = TextEditingController();
  PlanKind _kind = PlanKind.delivery;
  String _search = '';
  bool _initialized = false;
  bool _busy = false;
  final Set<String> _expanded = {};

  static const _maxStops = 60;

  void _initFrom(List<Order> orders) {
    if (_initialized) return;
    _initialized = true;
    for (final s in currentStopsFor(orders, widget.driver.id, widget.date)) {
      _order.add(s.orderId);
      _items[s.orderId] = s.itemIds.toSet();
    }
    for (final o in orders) {
      final a = o.assignment;
      if (a != null && a.driverId == widget.driver.id && a.date == widget.date && a.note != null) {
        _note.text = a.note!;
        break;
      }
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _toggleOrder(Order o) {
    setState(() {
      if (_order.contains(o.id)) {
        _order.remove(o.id);
        _items.remove(o.id);
      } else {
        _order.add(o.id);
        _items[o.id] = planKindOf(o) == PlanKind.delivery ? readyItemsOf(o).map((i) => i.id).toSet() : <String>{};
      }
    });
  }

  void _toggleItem(Order o, OrderItem item) {
    setState(() {
      final set = _items.putIfAbsent(o.id, () => <String>{});
      if (!_order.contains(o.id)) _order.add(o.id);
      if (!set.remove(item.id)) set.add(item.id);
      if (set.isEmpty) {
        _order.remove(o.id);
        _items.remove(o.id);
      }
    });
  }

  Future<void> _save(List<Order> orders) async {
    if (_order.length > _maxStops) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitta topshiriqda ko\'pi bilan $_maxStops ta buyurtma bo\'ladi'), backgroundColor: AppColors.danger),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final byId = {for (final o in orders) o.id: o};
      final stops = <AssignmentStop>[];
      for (final id in _order) {
        final o = byId[id];
        if (o == null) continue;
        if (planKindOf(o) == PlanKind.delivery) {
          final ready = readyItemsOf(o).map((i) => i.id).toSet();
          final chosen = (_items[id] ?? const <String>{}).where(ready.contains).toList();
          if (chosen.isEmpty) continue;
          // Hamma tayyorlari tanlangan bo'lsa ham aniq ro'yxat yuboriladi:
          // keyin tayyor bo'lganlari o'z-o'zidan topshiriqqa qo'shilmasin.
          stops.add((orderId: id, itemIds: chosen));
        } else if (planKindOf(o) == PlanKind.pickup) {
          stops.add((orderId: id, itemIds: const []));
        }
      }
      final result = await ref.read(supervisorRepositoryProvider).assignDeliveries(
            driverId: widget.driver.id,
            date: widget.date,
            stops: stops,
            note: _note.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.assigned == 0
                ? '${widget.driver.fullName}: topshiriq bekor qilindi'
                : '${widget.driver.fullName}ga ${result.assigned} ta buyurtma biriktirildi',
          ),
        ),
      );
    } catch (err) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err)), backgroundColor: AppColors.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
    _initFrom(orders);
    final threshold = ref.watch(warehouseReadyDaysProvider).valueOrNull ?? kDefaultWarehouseReadyDays;
    final now = DateTime.now();
    final today = dateKeyOf(now);

    final candidates = orders.where((o) => planKindOf(o) != null).toList();
    final counts = {
      PlanKind.delivery: candidates.where((o) => planKindOf(o) == PlanKind.delivery).length,
      PlanKind.pickup: candidates.where((o) => planKindOf(o) == PlanKind.pickup).length,
    };
    final q = _search;
    final shown = candidates.where((o) {
      if (planKindOf(o) != _kind) return false;
      return orderMatchesQuery(o, q);
    }).toList()
      // Tanlanganlari tepada (yo'l tartibida), qolganlari eng eskisi birinchi.
      ..sort((a, b) {
        final ia = _order.indexOf(a.id), ib = _order.indexOf(b.id);
        if (ia >= 0 || ib >= 0) {
          if (ia < 0) return 1;
          if (ib < 0) return -1;
          return ia.compareTo(ib);
        }
        return a.createdAt.compareTo(b.createdAt);
      });

    final itemTotal = _items.values.fold<int>(0, (s, set) => s + set.length);
    final dayLabel = widget.date == today ? 'Bugun' : formatDateUz(DateTime.parse(widget.date));

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.driver.fullName, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('Topshiriq · $dayLabel', style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      body: Column(
        children: [
          FilterPillBar(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            children: [
              FilterPill(
                label: 'Yetkazish',
                icon: Icons.inventory_2_rounded,
                count: counts[PlanKind.delivery],
                selected: _kind == PlanKind.delivery,
                onTap: () => setState(() => _kind = PlanKind.delivery),
              ),
              FilterPill(
                label: 'Olib kelish',
                icon: Icons.move_to_inbox_rounded,
                count: counts[PlanKind.pickup],
                selected: _kind == PlanKind.pickup,
                onTap: () => setState(() => _kind = PlanKind.pickup),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              decoration: const InputDecoration(
                hintText: 'Mijoz, #raqam yoki manzil',
                prefixIcon: Icon(Icons.search_rounded, size: 20),
                isDense: true,
              ),
            ),
          ),
          Expanded(
            child: shown.isEmpty
                ? Center(
                    child: Text(
                      q.isNotEmpty
                          ? 'Topilmadi'
                          : _kind == PlanKind.delivery
                              ? "Yetkazishga tayyor buyurtma yo'q"
                              : "Olib kelinadigan buyurtma yo'q",
                      style: const TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: shown.length,
                    itemBuilder: (context, i) {
                      final o = shown[i];
                      final position = _order.indexOf(o.id);
                      final other = o.assignment != null &&
                              isAssignmentOpen(o) &&
                              !(o.assignment!.driverId == widget.driver.id && o.assignment!.date == widget.date)
                          ? o.assignment
                          : null;
                      return _PlanOrderCard(
                        order: o,
                        position: position >= 0 ? position + 1 : null,
                        selectedItems: _items[o.id] ?? const <String>{},
                        otherDriver: other == null ? null : '${other.driverName} · ${other.date == today ? 'bugun' : other.date}',
                        expanded: _expanded.contains(o.id),
                        warehouseOf: (item) => isItemInWarehouse(item, threshold, now) ? readyDays(item, now) : null,
                        onToggle: () => _toggleOrder(o),
                        onToggleItem: (item) => _toggleItem(o, item),
                        onExpand: () => setState(() => _expanded.contains(o.id) ? _expanded.remove(o.id) : _expanded.add(o.id)),
                      );
                    },
                  ),
          ),
          _BottomBar(
            stops: _order.length,
            items: itemTotal,
            note: _note,
            busy: _busy,
            onSave: () => _save(orders),
          ),
        ],
      ),
    );
  }
}

class _PlanOrderCard extends StatelessWidget {
  final Order order;
  final int? position;
  final Set<String> selectedItems;
  final String? otherDriver;
  final bool expanded;
  final int? Function(OrderItem item) warehouseOf;
  final VoidCallback onToggle;
  final ValueChanged<OrderItem> onToggleItem;
  final VoidCallback onExpand;

  const _PlanOrderCard({
    required this.order,
    required this.position,
    required this.selectedItems,
    required this.otherDriver,
    required this.expanded,
    required this.warehouseOf,
    required this.onToggle,
    required this.onToggleItem,
    required this.onExpand,
  });

  @override
  Widget build(BuildContext context) {
    final selected = position != null;
    final isDelivery = planKindOf(order) == PlanKind.delivery;
    final ready = isDelivery ? readyItemsOf(order) : const <OrderItem>[];
    final remaining = order.itemStatusCounts.entries.where((e) => e.key != 'done').fold<int>(0, (s, e) => s + e.value);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: selected ? AppColors.primary.withValues(alpha: 0.05) : AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: selected ? AppColors.primary : AppColors.border, width: selected ? 1.5 : 1),
          ),
          child: Column(
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: onToggle,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 10, 6, 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: selected ? AppColors.primary : AppColors.bg,
                          borderRadius: BorderRadius.circular(9),
                          border: Border.all(color: selected ? AppColors.primary : AppColors.border),
                        ),
                        child: selected
                            ? Text('$position', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13))
                            : null,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text.rich(
                              TextSpan(children: [
                                TextSpan(
                                    text: '${order.displayNumber}  ',
                                    style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w900)),
                                TextSpan(text: order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName),
                              ]),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.25),
                            ),
                            if (order.location.isNotEmpty)
                              Text(order.location,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark)),
                            const SizedBox(height: 3),
                            Text(
                              isDelivery
                                  ? '${ready.length}/$remaining tayyor · ${formatMoneyUz(ready.fold<num>(0, (s, i) => s + i.price))}'
                                  : 'Qabul: ${formatDateTimeUz(order.createdAt)}',
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: isDelivery ? AppColors.success : AppColors.grayDark,
                              ),
                            ),
                            if (otherDriver != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(
                                  'Biriktirilgan: $otherDriver',
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFDD6B20)),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (isDelivery)
                        IconButton(
                          tooltip: 'Mahsulotlar',
                          onPressed: onExpand,
                          icon: AnimatedRotation(
                            turns: expanded ? 0.5 : 0,
                            duration: const Duration(milliseconds: 180),
                            child: const Icon(Icons.expand_more_rounded),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              if (isDelivery && expanded)
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                  child: Column(
                    children: [
                      for (final item in ready)
                        CheckboxListTile(
                          value: selectedItems.contains(item.id),
                          onChanged: (_) => onToggleItem(item),
                          dense: true,
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                          title: Text('${item.subId(order.orderNumber)} · ${item.name}',
                              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                          subtitle: Text(
                            [
                              itemMeasurementLabel(item),
                              formatMoneyUz(item.price),
                              if (warehouseOf(item) != null) 'omborda · ${warehouseOf(item)} kun',
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: const TextStyle(fontSize: 12),
                          ),
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

class _BottomBar extends StatelessWidget {
  final int stops;
  final int items;
  final TextEditingController note;
  final bool busy;
  final VoidCallback onSave;

  const _BottomBar({required this.stops, required this.items, required this.note, required this.busy, required this.onSave});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).viewInsets.bottom),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.06), blurRadius: 14, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: note,
              maxLength: 300,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: "Dastavchikka izoh (ixtiyoriy)",
                prefixIcon: Icon(Icons.sticky_note_2_outlined, size: 20),
                isDense: true,
                counterText: '',
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    stops == 0 ? "Hech narsa tanlanmagan" : '$stops ta buyurtma${items > 0 ? ' · $items ta mahsulot' : ''}',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink),
                  ),
                ),
                FilledButton.icon(
                  onPressed: busy ? null : onSave,
                  icon: busy
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check_rounded),
                  label: Text(stops == 0 ? 'Bekor qilish' : 'Saqlash'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 46)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

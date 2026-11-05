import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/utils/launch_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import 'delivery_order_detail_sheet.dart';

/// Topshiriq hali bajarilmaganmi: olib kelishda — buyurtma hali mijozda;
/// yetkazishda — topshiriqdagi mahsulotlardan kamida biri hali
/// topshirilmagan.
bool isAssignmentOpen(Order o) {
  final a = o.assignment;
  if (a == null || o.isDone) return false;
  if (a.isPickup) return o.status == 'new' || o.status == 'picked_up';
  if (o.status != 'brought_in') return false;
  final items = o.itemsMirror;
  if (items == null) return true;
  final ids = a.itemIds.toSet();
  return items.any((i) => i.status != 'done' && (ids.isEmpty || ids.contains(i.id)));
}

/// Shu dastavchikning bugungi (va o'tgan kunlardan qolib ketgan)
/// ochiq topshiriqlari — kun, so'ng nazoratchi belgilagan tartib bo'yicha.
List<Order> openAssignmentsFor(List<Order> orders, String driverId, DateTime now) {
  final today = dateKeyOf(now);
  final list = orders.where((o) {
    final a = o.assignment;
    return a != null && a.driverId == driverId && a.date.compareTo(today) <= 0 && isAssignmentOpen(o);
  }).toList()
    ..sort((x, y) {
      final byDate = x.assignment!.date.compareTo(y.assignment!.date);
      return byDate != 0 ? byDate : x.assignment!.seq.compareTo(y.assignment!.seq);
    });
  return list;
}

/// Topshiriqdagi, hali topshirilmagan mahsulotlar.
List<OrderItem> assignedItemsOf(Order o) {
  final a = o.assignment;
  if (a == null || a.isPickup) return const [];
  final ids = a.itemIds.toSet();
  return [
    for (final i in o.itemsMirror ?? const <OrderItem>[])
      if (i.status != 'done' && (ids.isEmpty || ids.contains(i.id))) i,
  ];
}

/// Shu topshiriqda mijozdan olinadigan summa — topshirish oynasi bilan
/// bir xil qoida: tanlangan mahsulotlar narxi minus ishlatilmagan
/// oldindan to'lov.
num assignedDueOf(Order o) {
  final gross = assignedItemsOf(o).fold<num>(0, (s, i) => s + i.price);
  final due = gross - o.prepaidCredit;
  return due > 0 ? due : 0;
}

/// Dastavchik bosh sahifasidagi "Topshiriq" kartasi — nazoratchi biriktirgan
/// buyurtmalar bo'lsa ko'rinadi.
class DriverTaskBanner extends ConsumerWidget {
  const DriverTaskBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final driverId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;
    final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
    if (driverId == null) return const SizedBox.shrink();
    final tasks = openAssignmentsFor(orders, driverId, DateTime.now());
    if (tasks.isEmpty) return const SizedBox.shrink();

    final pickups = tasks.where((o) => o.assignment!.isPickup).length;
    final deliveries = tasks.length - pickups;
    final by = tasks.first.assignment!.assignedByName;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Material(
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const DriverTasksScreen())),
          child: Ink(
            decoration: const BoxDecoration(gradient: primaryGradient),
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.assignment_turned_in_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Topshiriq · ${tasks.length} ta buyurtma',
                        style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          if (deliveries > 0) '$deliveries ta yetkazish',
                          if (pickups > 0) '$pickups ta olib kelish',
                          if (by.isNotEmpty) 'Nazoratchi: $by',
                        ].join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: Colors.white),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Dastavchikning topshiriq ro'yxati — nazoratchi belgilagan tartibda,
/// har birida nima qilish kerakligi (olib kelish / qaysi mahsulotlarni
/// yetkazish) va yig'iladigan summa bilan.
class DriverTasksScreen extends ConsumerWidget {
  const DriverTasksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final driverId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId ?? '';
    final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
    final now = DateTime.now();
    final tasks = openAssignmentsFor(orders, driverId, now);
    final today = dateKeyOf(now);
    final notes = {for (final o in tasks) if (o.assignment!.note != null) o.assignment!.note!};
    final totalDue = tasks.fold<num>(0, (s, o) => s + assignedDueOf(o));

    return Scaffold(
      appBar: AppBar(title: const Text('Topshiriq')),
      body: tasks.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.task_alt_rounded, size: 44, color: AppColors.success),
                    SizedBox(height: 12),
                    Text('Topshiriq bajarildi', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    SizedBox(height: 4),
                    Text("Hozircha sizga biriktirilgan buyurtma yo'q", style: TextStyle(color: AppColors.grayDark)),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                _Summary(count: tasks.length, totalDue: totalDue),
                for (final note in notes)
                  Container(
                    margin: const EdgeInsets.only(top: 10),
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.sticky_note_2_rounded, size: 18, color: AppColors.ink),
                        const SizedBox(width: 8),
                        Expanded(child: Text(note, style: const TextStyle(fontSize: 13, color: AppColors.ink, height: 1.35))),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                for (var i = 0; i < tasks.length; i++) ...[
                  _StopCard(order: tasks[i], index: i + 1, overdue: tasks[i].assignment!.date.compareTo(today) < 0),
                  const SizedBox(height: 10),
                ],
              ],
            ),
    );
  }
}

class _Summary extends StatelessWidget {
  final int count;
  final num totalDue;
  const _Summary({required this.count, required this.totalDue});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(gradient: primaryGradient, borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$count ta buyurtma', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text("Nazoratchi belgilagan tartibda", style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
              ],
            ),
          ),
          if (totalDue > 0)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text("Yig'iladi", style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
                Text(formatMoneyUz(totalDue), style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w900)),
              ],
            ),
        ],
      ),
    );
  }
}

class _StopCard extends StatelessWidget {
  final Order order;
  final int index;
  final bool overdue;

  const _StopCard({required this.order, required this.index, required this.overdue});

  @override
  Widget build(BuildContext context) {
    final a = order.assignment!;
    final items = assignedItemsOf(order);
    final due = assignedDueOf(order);
    final kindColor = a.isPickup ? AppColors.info : AppColors.success;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => openDeliveryOrderDetailSheet(context, order),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: overdue ? AppColors.danger.withValues(alpha: 0.4) : AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(10)),
                    child: Text('$index', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text.rich(
                          TextSpan(children: [
                            TextSpan(text: '${order.displayNumber}  ', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w900)),
                            TextSpan(text: order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName),
                          ]),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.25),
                        ),
                        if (order.location.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              order.location,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: kindColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                    child: Text(
                      a.isPickup ? 'Olib kelish' : 'Yetkazish',
                      style: TextStyle(color: kindColor, fontSize: 11.5, fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
              if (overdue)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Oldingi kundan qolgan', style: TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              if (items.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final i in items)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(8)),
                        child: Text(
                          '${i.subId(order.orderNumber)} ${i.name}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.ink),
                        ),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      a.isPickup
                          ? formatPhoneUz(order.phone)
                          : (due > 0 ? "Yig'iladi: ${formatMoneyUz(due)}" : "To'langan — pul olinmaydi"),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: a.isPickup ? AppColors.grayDark : (due > 0 ? AppColors.success : AppColors.grayDark),
                      ),
                    ),
                  ),
                  if (order.phone.isNotEmpty)
                    IconButton(
                      tooltip: "Qo'ng'iroq",
                      onPressed: () => callPhone(order.phone),
                      icon: const Icon(Icons.call_rounded, color: AppColors.success),
                    ),
                  if (order.gpsCoords != null && order.gpsCoords!.isNotEmpty)
                    IconButton(
                      tooltip: "Yo'nalish",
                      onPressed: () => navigateToGps(order.gpsCoords!),
                      icon: const Icon(Icons.navigation_rounded, color: AppColors.info),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

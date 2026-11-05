import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/order_items_provider.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/launch_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import '../delivery/driver_tasks.dart' show isAssignmentOpen;
import '../dispatcher/order_detail_sheet.dart' show openOrderDetailSheet;
import '../shared/catalog_item_sheet.dart';
import '../shared/comments_section.dart';
import '../shared/item_detail_row.dart';
import 'assign_driver_sheet.dart';
import 'delivery_planning.dart';
import 'stage_action_buttons.dart';
import 'supervisor_workflow.dart';

/// Nazoratchining buyurtma oynasi: mijoz, dastavchik topshirig'i,
/// mahsulotlar (har birining bosqich amali bilan), izohlar.
void openSupervisorOrderSheet(BuildContext context, Order order, {bool focusComments = false}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _SupervisorOrderSheet(order: order, focusComments: focusComments),
  );
}

class _SupervisorOrderSheet extends ConsumerWidget {
  final Order order;
  final bool focusComments;
  const _SupervisorOrderSheet({required this.order, required this.focusComments});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final live = ref.watch(liveOrderProvider(order.id)) ?? order;
    final itemsAsync = ref.watch(orderItemsProvider(live.id));
    final status = statusOf(live.status);

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      expand: false,
      builder: (context, scroll) => Container(
        decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
            Expanded(
              child: ListView(
                controller: scroll,
                cacheExtent: focusComments ? 4000 : null,
                padding: EdgeInsets.fromLTRB(16, 14, 16, 28 + MediaQuery.of(context).viewInsets.bottom),
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Buyurtma ${live.displayNumber}',
                          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: AppColors.ink),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: status.background, borderRadius: BorderRadius.circular(10)),
                        child: Text(status.label, style: TextStyle(color: status.color, fontWeight: FontWeight.w800, fontSize: 12.5)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Qabul: ${formatDateTimeUz(live.createdAt)} · ${live.serviceType == 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}',
                    style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                  ),
                  const SizedBox(height: 14),
                  _CustomerCard(order: live),
                  const SizedBox(height: 12),
                  _AssignmentCard(order: live),
                  const SizedBox(height: 12),
                  _ItemsCard(order: live, itemsAsync: itemsAsync),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => openOrderDetailSheet(context, live),
                    icon: const Icon(Icons.open_in_full_rounded, size: 18),
                    label: const Text("To'liq ma'lumot, to'lov va tahrirlash"),
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  ),
                  const SizedBox(height: 18),
                  CommentsSection(orderId: live.id, focus: focusComments),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  final Order order;
  const _CustomerCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(formatPhoneUz(order.phone),
                    style: const TextStyle(fontSize: 14, color: AppColors.ink, fontWeight: FontWeight.w600)),
              ),
              if (order.phone.isNotEmpty)
                IconButton.filledTonal(
                  tooltip: "Qo'ng'iroq",
                  onPressed: () => callPhone(order.phone),
                  icon: const Icon(Icons.call_rounded, size: 20),
                ),
            ],
          ),
          if (order.location.isNotEmpty)
            Row(
              children: [
                Expanded(
                  child: Text(order.location, style: const TextStyle(fontSize: 13, color: AppColors.grayDark, height: 1.35)),
                ),
                if (order.gpsCoords != null && order.gpsCoords!.isNotEmpty)
                  IconButton(
                    tooltip: "Yo'nalish",
                    onPressed: () => navigateToGps(order.gpsCoords!),
                    icon: const Icon(Icons.navigation_rounded, color: AppColors.info),
                  ),
              ],
            ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Text('Summa: ', style: TextStyle(fontSize: 13, color: AppColors.grayDark)),
              Text(
                order.totalPrice > 0 ? formatMoneyUz(order.totalPrice) : "o'lchanmagan",
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.primary),
              ),
              if (order.prepaidAmount > 0) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    "oldindan ${formatMoneyUz(order.prepaidAmount)}",
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.success, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// Dastavchik topshirig'i — kimga, qaysi kun, nima qilish kerak.
class _AssignmentCard extends ConsumerStatefulWidget {
  final Order order;
  const _AssignmentCard({required this.order});

  @override
  ConsumerState<_AssignmentCard> createState() => _AssignmentCardState();
}

class _AssignmentCardState extends ConsumerState<_AssignmentCard> {
  bool _busy = false;

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await removeOrderFromDriver(ref.read(supervisorRepositoryProvider), widget.order);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final a = order.assignment;
    final open = a != null && isAssignmentOpen(order);
    final kind = planKindOf(order);
    if (!open && kind == null) return const SizedBox.shrink();

    final today = dateKeyOf(DateTime.now());
    final tomorrow = dateKeyOf(DateTime.now().add(const Duration(days: 1)));
    String dayLabel(String d) => d == today
        ? 'bugun'
        : d == tomorrow
            ? 'ertaga'
            : d;

    return _Card(
      child: open
          ? Row(
              children: [
                const Icon(Icons.local_shipping_rounded, color: AppColors.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.driverName, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      Text(
                        '${a.isPickup ? 'Olib kelish' : 'Yetkazish${a.itemIds.isNotEmpty ? ' · ${a.itemIds.length} ta mahsulot' : ''}'} · ${dayLabel(a.date)}',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                      ),
                    ],
                  ),
                ),
                TextButton(onPressed: _busy ? null : () => openAssignDriverSheet(context, order), child: const Text("O'zgartirish")),
                IconButton(
                  tooltip: 'Olib tashlash',
                  onPressed: _busy ? null : _remove,
                  icon: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.close_rounded, color: AppColors.danger),
                ),
              ],
            )
          : SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: () => openAssignDriverSheet(context, order),
                icon: const Icon(Icons.local_shipping_rounded, size: 19),
                label: Text(kind == PlanKind.pickup ? 'Olib kelishni dastavchikka berish' : 'Yetkazishni dastavchikka berish'),
              ),
            ),
    );
  }
}

class _ItemsCard extends StatelessWidget {
  final Order order;
  final AsyncValue<List<OrderItem>> itemsAsync;
  const _ItemsCard({required this.order, required this.itemsAsync});

  @override
  Widget build(BuildContext context) {
    final canAdd = order.serviceType == 'pickup' && (order.status == 'new' || order.status == 'brought_in');
    final items = itemsAsync.valueOrNull ?? const <OrderItem>[];
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Mahsulotlar (${items.length})',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
              ),
              if (canAdd)
                TextButton.icon(
                  onPressed: () => openCatalogItemSheet(context, order),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text("Qo'shish"),
                ),
            ],
          ),
          if (itemsAsync.isLoading && items.isEmpty)
            const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
          else if (itemsAsync.hasError && items.isEmpty)
            Text(describeApiError(itemsAsync.error!), style: const TextStyle(color: AppColors.danger))
          else if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Text("Hali mahsulot qo'shilmagan", style: TextStyle(color: AppColors.grayDark)),
            ),
          for (final item in items) ...[
            const Divider(height: 14),
            ItemDetailRow(
              item: item,
              subId: item.subId(order.orderNumber),
              orderId: order.id,
              editable: _editable(item),
              onTap: _editable(item) ? () => openCatalogItemSheet(context, order, existingItem: item) : null,
            ),
            if (order.status == 'brought_in' && (kStageActions.containsKey(item.status) || item.price <= 0))
              Align(alignment: Alignment.centerRight, child: StageActionButtons(work: WorkItem(order, item))),
          ],
        ],
      ),
    );
  }

  /// Server qoidasi: mahsulot "Navbatda" yoki "Yuvilmoqda" bo'lsa tahrirlanadi.
  bool _editable(OrderItem item) => order.status != 'done' && (item.status == null || item.status == 'pending' || item.status == 'washing');
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: child,
      );
}

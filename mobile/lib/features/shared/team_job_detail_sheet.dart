import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/order_items_provider.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import 'catalog_item_sheet.dart';
import 'comments_section.dart';
import 'item_detail_row.dart';
import 'order_copy.dart';
import 'sales_manager_notes_card.dart';
import 'bonus_section.dart';
import 'prepayment_section.dart';
import '../../core/widgets/load_error_note.dart';
import '../printing/print_receipt_button.dart';

/// [focusComments] — kartadagi izoh bosilganda: ochilgach izohlar
/// bo'limigacha o'zi aylanadi.
void openTeamJobDetailSheet(BuildContext context, Order order, {bool focusComments = false}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _TeamJobDetailSheet(order: order, focusComments: focusComments),
  );
}

const _nextStage = {'team_assigned': 'in_progress', 'in_progress': 'done'};
const _actionLabel = {'team_assigned': 'Ishni boshlash', 'in_progress': 'Yakunlash'};


class _TeamJobDetailSheet extends ConsumerStatefulWidget {
  final Order order;
  final bool focusComments;
  const _TeamJobDetailSheet({required this.order, this.focusComments = false});

  @override
  ConsumerState<_TeamJobDetailSheet> createState() => _TeamJobDetailSheetState();
}

class _TeamJobDetailSheetState extends ConsumerState<_TeamJobDetailSheet> {
  bool _advancing = false;
  String? _error;

  Future<void> _advance() async {
    final next = _nextStage[_order.status];
    if (next == null) return;
    setState(() {
      _advancing = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).changeOrderStatus(orderId: _order.id, toStatus: next);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = describeApiError(e);
        _advancing = false;
      });
    }
  }

  /// Jonli holat — ochilgan paytdagi nusxa emas (liveOrderProvider).
  Order get _order => ref.read(liveOrderProvider(widget.order.id)) ?? widget.order;

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(liveOrderProvider(widget.order.id)) ?? widget.order;
    final status = statusOf(order.status);
    final actionLabel = _actionLabel[order.status];
    final itemsAsync = ref.watch(orderItemsProvider(order.id));

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Expanded(
                child: ListView(
                  // Izohga o'tishda butun varaq oldindan quriladi — aks
                  // holda ekrandan pastdagi izohlar bo'limi hali yo'q
                  // bo'ladi va unga aylanib bo'lmaydi. Varaq kichik, narxi arzon.
                  cacheExtent: widget.focusComments ? 4000 : null,
                  controller: scrollController,
                  // Talab: klaviatura chiqqanda eng pastdagi inputlar
                  // yopilib qolmasligi kerak.
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 32 + MediaQuery.of(context).viewInsets.bottom),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text('Joyida yuvish ${order.displayNumber}', style: Theme.of(context).textTheme.headlineSmall),
                          ),
                        ),
                        PrintReceiptButton(order: order, items: itemsAsync.valueOrNull),
                        CopyOrderButton(order: order, items: itemsAsync.valueOrNull),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: status.background, borderRadius: BorderRadius.circular(20)),
                          child: Text(status.label, style: TextStyle(color: status.color, fontWeight: FontWeight.w800, fontSize: 12)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.grayDark)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.location_on_rounded, size: 15, color: AppColors.gray),
                        const SizedBox(width: 6),
                        Expanded(child: Text(order.location, style: const TextStyle(fontSize: 13, color: AppColors.grayDark))),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: order.isOverdue ? AppColors.danger.withValues(alpha: 0.08) : AppColors.bg,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: _DeadlineStat(
                              icon: Icons.event_available_rounded,
                              label: 'Qabul qilingan',
                              value: formatDateUz(order.createdAt),
                            ),
                          ),
                          if (order.dueDate != null)
                            Expanded(
                              child: _DeadlineStat(
                                icon: Icons.timer_rounded,
                                label: 'Muddat',
                                value: formatDateUz(order.dueDate!),
                                accent: order.isOverdue,
                              ),
                            ),
                          if (order.dueDate != null)
                            Expanded(
                              child: _DeadlineStat(
                                icon: Icons.hourglass_bottom_rounded,
                                label: 'Qolgan vaqt',
                                value: formatDaysLeftUz(order.dueDate!),
                                accent: order.isOverdue,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (order.notedItems.isNotEmpty || order.estimatedPrice != null) ...[
                      const SizedBox(height: 16),
                      SalesManagerNotesCard(order: order),
                    ],
                    const SizedBox(height: 20),
                    itemsAsync.when(
                      loading: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
                      error: (e, _) => LoadErrorNote(error: e),
                      data: (items) => _TeamItemsCard(order: order, items: items),
                    ),
                    if (actionLabel != null) ...[
                      const SizedBox(height: 16),
                      if (_error != null) ...[
                        Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 10),
                      ],
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _advancing ? null : _advance,
                          style: FilledButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 16)),
                          child: _advancing
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                              : Text(actionLabel.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                      ),
                    ],
                    PrepaymentSection(order: order),
                    BonusSection(order: order),
                    const SizedBox(height: 20),
                    CommentsSection(orderId: order.id, focus: widget.focusComments),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DeadlineStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool accent;

  const _DeadlineStat({required this.icon, required this.label, required this.value, this.accent = false});

  @override
  Widget build(BuildContext context) {
    final color = accent ? AppColors.danger : AppColors.ink;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 13, color: accent ? AppColors.danger : AppColors.grayDark),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 10.5, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 3),
        Text(value, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: color)),
      ],
    );
  }
}

class _TeamItemsCard extends StatelessWidget {
  final Order order;
  final List<OrderItem> items;
  const _TeamItemsCard({required this.order, required this.items});

  @override
  Widget build(BuildContext context) {
    // Onsite buyurtmalarda item-level pipeline yo'q — faqat buyurtma
    // yakunlanmagunicha (done) tahrirlanadi.
    final editable = order.status != 'done';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Mahsulotlar',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
              ),
              if (editable)
                Flexible(
                  child: TextButton.icon(
                    onPressed: () => openCatalogItemSheet(context, order),
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: Text(items.isEmpty ? "Qo'shish" : "Yana qo'shish"),
                  ),
                ),
            ],
          ),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Hali mahsulot qo\'shilmagan', style: TextStyle(color: AppColors.gray, fontSize: 13)),
            )
          else
            for (final item in items)
              ItemDetailRow(
                item: item,
                subId: item.subId(order.orderNumber),
                editable: editable,
                onTap: editable ? () => openCatalogItemSheet(context, order, existingItem: item) : null,
              ),
        ],
      ),
    );
  }
}

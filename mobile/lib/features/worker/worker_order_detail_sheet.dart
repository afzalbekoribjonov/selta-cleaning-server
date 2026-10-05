import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/order_items_provider.dart';
import '../shared/catalog_item_sheet.dart';
import '../shared/comments_section.dart';
import '../shared/item_action_row.dart';
import '../shared/order_copy.dart';

/// [focusComments] — kartadagi izoh bosilganda: ochilgach izohlar
/// bo'limigacha o'zi aylanadi.
void openWorkerOrderDetailSheet(BuildContext context, Order order, {bool focusComments = false}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _WorkerOrderDetailSheet(order: order, focusComments: focusComments),
  );
}

/// Item tahrirlash server tomonida ham cheklangan ("washing"dan keyin
/// qulflanadi) — bu shunchaki mos UI ko'rsatish uchun.
const _itemStillEditableStatuses = {'pending', 'washing'};
bool itemEditableFor(String? status) => status == null || _itemStillEditableStatuses.contains(status);

class _WorkerOrderDetailSheet extends ConsumerWidget {
  final Order order;
  final bool focusComments;
  const _WorkerOrderDetailSheet({required this.order, this.focusComments = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                  cacheExtent: focusComments ? 4000 : null,
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
                            child: Text('Buyurtma ${order.displayNumber}', style: Theme.of(context).textTheme.headlineSmall),
                          ),
                        ),
                        CopyOrderButton(order: order, items: itemsAsync.valueOrNull),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.grayDark)),
                    const SizedBox(height: 20),
                    itemsAsync.when(
                      loading: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
                      error: (e, _) => Text('Xatolik: $e', style: const TextStyle(color: AppColors.danger)),
                      data: (items) => _ItemsCard(order: order, items: items),
                    ),
                    const SizedBox(height: 20),
                    CommentsSection(orderId: order.id, focus: focusComments),
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


class _ItemsCard extends StatelessWidget {
  final Order order;
  final List<OrderItem> items;
  const _ItemsCard({required this.order, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Mahsulotlar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const Spacer(),
              TextButton.icon(
                onPressed: () => openCatalogItemSheet(context, order),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: Text(items.isEmpty ? 'Belgilash' : "Qo'shish"),
              ),
            ],
          ),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Hali mahsulot belgilanmagan', style: TextStyle(color: AppColors.gray, fontSize: 13)),
            )
          else
            for (final item in items)
              ItemActionRow(
                order: order,
                item: item,
                editable: itemEditableFor(item.status),
                onEdit: () => openCatalogItemSheet(context, order, existingItem: item),
              ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';
import '../shared/comments_section.dart';
import 'item_entry_sheet.dart';

void openWorkerOrderDetailSheet(BuildContext context, Order order) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _WorkerOrderDetailSheet(order: order),
  );
}

const _nextStage = {'brought_in': 'washing', 'washing': 'packing', 'packing': 'qc_review'};
const _actionLabel = {
  'brought_in': 'Yuvishni boshlash',
  'washing': "Upakovkaga o'tkazish",
  'packing': 'Sifat nazoratiga yuborish',
};

class _WorkerOrderDetailSheet extends ConsumerStatefulWidget {
  final Order order;
  const _WorkerOrderDetailSheet({required this.order});

  @override
  ConsumerState<_WorkerOrderDetailSheet> createState() => _WorkerOrderDetailSheetState();
}

class _WorkerOrderDetailSheetState extends ConsumerState<_WorkerOrderDetailSheet> {
  bool _advancing = false;
  String? _error;

  Future<void> _advance(int itemCount) async {
    if (widget.order.status == 'brought_in' && itemCount == 0) {
      setState(() => _error = 'Avval mahsulotlarni belgilang');
      return;
    }
    setState(() {
      _advancing = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).changeOrderStatus(
            orderId: widget.order.id,
            toStatus: _nextStage[widget.order.status]!,
          );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = describeApiError(e);
        _advancing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final status = statusOf(order.status);
    final itemsAsync = ref.watch(_itemsProvider(order.id));

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
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('Buyurtma #${order.orderNumber}', style: Theme.of(context).textTheme.headlineSmall)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: status.background, borderRadius: BorderRadius.circular(20)),
                          child: Text(status.label, style: TextStyle(color: status.color, fontWeight: FontWeight.w800, fontSize: 12)),
                        ),
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
                    const SizedBox(height: 16),
                    if (_error != null) ...[
                      Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 10),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _advancing ? null : () => _advance(itemsAsync.value?.length ?? 0),
                        style: FilledButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 16)),
                        child: _advancing
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                            : Text(_actionLabel[order.status]!.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                    ),
                    const SizedBox(height: 20),
                    CommentsSection(orderId: order.id),
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

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

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
                onPressed: () => openItemEntrySheet(context, order.id),
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
            for (final item in items) _itemRow(item),
        ],
      ),
    );
  }

  Widget _itemRow(OrderItem item) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
            child: Text(item.subId(order.orderNumber), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 11.5)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
          if (item.area > 0) Text('${item.area} m²', style: const TextStyle(color: AppColors.grayDark, fontSize: 12)),
        ],
      ),
    );
  }
}

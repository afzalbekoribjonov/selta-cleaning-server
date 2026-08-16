import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show authStateProvider, describeApiError;
import '../../core/services/orders_repository.dart';
import '../shared/comments_section.dart';

void openQcOrderDetailSheet(BuildContext context, Order order) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _QcOrderDetailSheet(order: order),
  );
}

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

class _QcOrderDetailSheet extends ConsumerWidget {
  final Order order;
  const _QcOrderDetailSheet({required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                    Text('Buyurtma #${order.orderNumber}', style: Theme.of(context).textTheme.headlineSmall),
                    Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.grayDark)),
                    const SizedBox(height: 6),
                    itemsAsync.when(
                      loading: () => const Padding(padding: EdgeInsets.all(6), child: LinearProgressIndicator()),
                      error: (e, _) => Text('Xatolik: $e', style: const TextStyle(color: AppColors.danger)),
                      data: (items) {
                        final passed = items.where((i) => i.qcStatus == 'passed').length;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 10),
                            Text('$passed / ${items.length} mahsulot tekshirildi', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.grayDark)),
                            const SizedBox(height: 14),
                            for (final item in items) _QcItemCard(order: order, item: item),
                          ],
                        );
                      },
                    ),
                    const SizedBox(height: 20),
                    _QcRatingCard(order: order),
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

/// Sifat nazorati butun buyurtmaga umumiy baho (1-5 yulduz) va izoh
/// qoldiradi — har bir mahsulotning alohida pass/fail holatidan tashqari,
/// upakovka/umumiy ishning sifatini baholash uchun.
class _QcRatingCard extends ConsumerStatefulWidget {
  final Order order;
  const _QcRatingCard({required this.order});

  @override
  ConsumerState<_QcRatingCard> createState() => _QcRatingCardState();
}

class _QcRatingCardState extends ConsumerState<_QcRatingCard> {
  late int _rating = widget.order.qcRating ?? 0;
  late final TextEditingController _noteController = TextEditingController(text: widget.order.qcRatingNote ?? '');
  bool _saving = false;
  bool _saved = false;
  String? _error;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_rating == 0) {
      setState(() => _error = 'Baho tanlang');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).submitOrderQcRating(
            orderId: widget.order.id,
            rating: _rating,
            note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
          );
      if (mounted) setState(() => _saved = true);
    } catch (e) {
      setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Umumiy sifat bahosi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 2),
          const Text('Upakovka va ishning umumiy sifatini baholang', style: TextStyle(fontSize: 12, color: AppColors.grayDark)),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                InkWell(
                  onTap: () => setState(() {
                    _rating = i;
                    _saved = false;
                  }),
                  child: Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Icon(
                      i <= _rating ? Icons.star_rounded : Icons.star_border_rounded,
                      color: AppColors.accent,
                      size: 30,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _noteController,
            minLines: 1,
            maxLines: 3,
            decoration: const InputDecoration(hintText: 'Izoh (ixtiyoriy)', isDense: true),
            onChanged: (_) => setState(() => _saved = false),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (_error != null) Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600))),
              if (_saved && _error == null)
                const Expanded(
                  child: Text("Saqlandi", style: TextStyle(color: AppColors.success, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              const Spacer(),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Saqlash'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QcItemCard extends ConsumerStatefulWidget {
  final Order order;
  final OrderItem item;
  const _QcItemCard({required this.order, required this.item});

  @override
  ConsumerState<_QcItemCard> createState() => _QcItemCardState();
}

class _QcItemCardState extends ConsumerState<_QcItemCard> {
  bool _saving = false;
  String? _error;

  Future<void> _setStatus(String qcStatus) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).submitItemQc(
            orderId: widget.order.id,
            itemId: widget.item.id,
            qcStatus: qcStatus,
          );
    } catch (e) {
      setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isPassed = item.qcStatus == 'passed';
    final isFailed = item.qcStatus == 'failed';

    final borderColor = isPassed ? AppColors.success : (isFailed ? AppColors.danger : AppColors.border);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor, width: isPassed || isFailed ? 1.5 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                child: Text(
                  item.subId(widget.order.orderNumber),
                  style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
              if (isPassed) const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 20),
              if (isFailed) const Icon(Icons.cancel_rounded, color: AppColors.danger, size: 20),
            ],
          ),
          const SizedBox(height: 10),
          if (_saving)
            const Center(child: Padding(padding: EdgeInsets.symmetric(vertical: 6), child: CircularProgressIndicator(strokeWidth: 2)))
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _setStatus('failed'),
                    icon: const Icon(Icons.close_rounded, size: 18),
                    label: const Text("O'tmadi"),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.danger,
                      side: BorderSide(color: isFailed ? AppColors.danger : AppColors.border),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _setStatus('passed'),
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text("O'tdi"),
                    style: FilledButton.styleFrom(backgroundColor: isPassed ? AppColors.success : AppColors.primary),
                  ),
                ),
              ],
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}

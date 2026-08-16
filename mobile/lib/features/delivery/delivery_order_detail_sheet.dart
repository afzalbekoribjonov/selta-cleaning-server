import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../shared/comments_section.dart';

void openDeliveryOrderDetailSheet(BuildContext context, Order order) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _DeliveryOrderDetailSheet(order: order),
  );
}

const _nextStage = {'new': 'picked_up', 'picked_up': 'brought_in', 'ready': 'done'};
const _actionLabel = {
  'new': 'Olib ketildi',
  'picked_up': "Sexga yetkazildi",
  'ready': 'Mijozga yetkazildi',
};

class _DeliveryOrderDetailSheet extends ConsumerStatefulWidget {
  final Order order;
  const _DeliveryOrderDetailSheet({required this.order});

  @override
  ConsumerState<_DeliveryOrderDetailSheet> createState() => _DeliveryOrderDetailSheetState();
}

class _DeliveryOrderDetailSheetState extends ConsumerState<_DeliveryOrderDetailSheet> {
  bool _advancing = false;
  String? _error;

  Future<num?> _promptCollectedAmount() async {
    final controller = TextEditingController();
    return showDialog<num>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Mijozdan qabul qilingan summa"),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          autofocus: true,
          decoration: const InputDecoration(hintText: "Masalan: 150000 (ixtiyoriy)", suffixText: "so'm"),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text("O'tkazib yuborish")),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(num.tryParse(controller.text.replaceAll(',', '.')) ?? 0),
            child: const Text('Tasdiqlash'),
          ),
        ],
      ),
    );
  }

  Future<void> _advance() async {
    final next = _nextStage[widget.order.status];
    if (next == null) return;

    num? collectedAmount;
    if (widget.order.status == 'ready') {
      collectedAmount = await _promptCollectedAmount();
      if (!mounted) return;
    }

    setState(() {
      _advancing = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).changeOrderStatus(
            orderId: widget.order.id,
            toStatus: next,
            collectedAmount: collectedAmount,
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
    final actionLabel = _actionLabel[order.status];

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
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
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _row(Icons.person_rounded, order.customerName),
                          _row(Icons.phone_rounded, order.phone),
                          _row(Icons.location_on_rounded, order.location),
                          if (order.dueDate != null) _row(Icons.event_rounded, 'Muddat: ${formatDateUz(order.dueDate!)}', color: order.isOverdue ? AppColors.danger : null),
                        ],
                      ),
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

  Widget _row(IconData icon, String text, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: color ?? AppColors.gray),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, color: color ?? AppColors.ink, fontWeight: color != null ? FontWeight.w700 : FontWeight.w500))),
          ],
        ),
      );
}

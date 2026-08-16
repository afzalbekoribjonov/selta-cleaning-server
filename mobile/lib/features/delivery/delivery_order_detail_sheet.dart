import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show authStateProvider, describeApiError;
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/launch_utils.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/catalog_item_sheet.dart';
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

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

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

  /// "Olib ketildi"ga o'tishdan oldin GPS majburiy — mijoz manzilida
  /// turgan chog'da qurilma joylashuvi buyurtmaga saqlanadi.
  Future<String?> _captureGps() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      setState(() => _error = "Joylashuv xizmati o'chirilgan — uni yoqing");
      return null;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      setState(() => _error = "Joylashuv ruxsati berilmadi — sozlamalardan yoqing");
      return null;
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      return '${position.latitude},${position.longitude}';
    } catch (_) {
      setState(() => _error = "GPS manzilini olib bo'lmadi — qayta urinib ko'ring");
      return null;
    }
  }

  Future<void> _advance() async {
    final next = _nextStage[widget.order.status];
    if (next == null) return;

    String? gpsCoords;
    num? collectedAmount;

    if (widget.order.status == 'new') {
      setState(() {
        _advancing = true;
        _error = null;
      });
      gpsCoords = await _captureGps();
      if (gpsCoords == null) {
        setState(() => _advancing = false);
        return;
      }
    }

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
            gpsCoords: gpsCoords,
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
    final itemsAsync = ref.watch(_itemsProvider(order.id));

    return DraggableScrollableSheet(
      initialChildSize: 0.8,
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
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        CardActionButton(icon: Icons.call_rounded, label: "Qo'ng'iroq", onTap: () => callPhone(order.phone)),
                        if (order.status == 'ready' && order.gpsCoords != null && order.gpsCoords!.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          CardActionButton(icon: Icons.navigation_rounded, label: "Yo'lga chiqish", filled: true, onTap: () => navigateToGps(order.gpsCoords!)),
                        ],
                      ],
                    ),
                    if (order.status == 'new') ...[
                      const SizedBox(height: 16),
                      itemsAsync.when(
                        loading: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
                        error: (e, _) => Text('Xatolik: $e', style: const TextStyle(color: AppColors.danger)),
                        data: (items) => _PickupItemsCard(order: order, items: items),
                      ),
                    ],
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

/// Dastavchik mijoz oldida ixtiyoriy ravishda mahsulot(lar) belgilashi
/// mumkin (talab #3) — majburiy emas, faqat GPS bilan "Olib ketildi"ga
/// o'tish majburiy.
class _PickupItemsCard extends StatelessWidget {
  final Order order;
  final List<OrderItem> items;
  const _PickupItemsCard({required this.order, required this.items});

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
              const Text('Mahsulotlar (ixtiyoriy)', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const Spacer(),
              TextButton.icon(
                onPressed: () => openCatalogItemSheet(context, order.id),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: Text(items.isEmpty ? "Qo'shish" : "Yana qo'shish"),
              ),
            ],
          ),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text("Mijoz oldida mahsulot belgilashingiz mumkin, yoki keyinroq ishchi belgilaydi", style: TextStyle(color: AppColors.gray, fontSize: 12.5)),
            )
          else
            for (final item in items)
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => openCatalogItemSheet(context, order.id, existingItem: item),
                child: Padding(
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
                      Text("${item.price.toStringAsFixed(0)} so'm", style: const TextStyle(color: AppColors.grayDark, fontSize: 12)),
                      const SizedBox(width: 6),
                      const Icon(Icons.edit_rounded, size: 14, color: AppColors.gray),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

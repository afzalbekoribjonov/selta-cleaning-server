import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show authStateProvider;
import '../../core/services/orders_repository.dart';
import '../shared/catalog_item_sheet.dart';
import '../shared/item_detail_row.dart';

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

/// Talab: narxi 0 so'm bo'lib qolgan mahsulotlar bo'lsa, dastavchik
/// buyurtmani "Qabul qilindi"ga o'tkaza olmasligi kerak — bu oyna aynan
/// o'sha mahsulotlarni ko'rsatib, bittalab tuzatishga yo'naltiradi. Ro'yxat
/// jonli (StreamProvider) — mahsulot tuzatilib narxi kiritilgach, u shu
/// yerdan avtomatik yo'qoladi. Hammasi tuzatilgach, dastavchik "QABUL
/// QILINDI"ni yana bosishi kerak (talab: har bir amal ongli tasdiqlansin).
Future<void> openZeroPriceAttentionSheet(BuildContext context, Order order) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _ZeroPriceAttentionSheet(order: order),
  );
}

class _ZeroPriceAttentionSheet extends ConsumerWidget {
  final Order order;
  const _ZeroPriceAttentionSheet({required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(_itemsProvider(order.id));

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.3,
      maxChildSize: 0.85,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Row(
                  children: [
                    const Icon(Icons.error_rounded, color: AppColors.danger, size: 22),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('Narxi kiritilmagan mahsulotlar', style: Theme.of(context).textTheme.titleLarge),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Text(
                  "Davom etishdan oldin quyidagi mahsulotlarning narxini kiriting — har birini bosib to'g'irlang.",
                  style: TextStyle(fontSize: 13, color: AppColors.grayDark),
                ),
              ),
              Expanded(
                child: itemsAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('Xatolik: $e')),
                  data: (items) {
                    final zeroPriced = items.where((i) => i.price <= 0).toList();
                    if (zeroPriced.isEmpty) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 40),
                              const SizedBox(height: 10),
                              const Text(
                                "Barchasi tayyor — endi \"QABUL QILINDI\"ni bosishingiz mumkin",
                                textAlign: TextAlign.center,
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: () => Navigator.of(context).pop(),
                                child: const Text('Yopish'),
                              ),
                            ],
                          ),
                        ),
                      );
                    }
                    return ListView(
                      controller: scrollController,
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                      children: [
                        for (final item in zeroPriced)
                          Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.danger.withValues(alpha: 0.4)),
                            ),
                            child: ItemDetailRow(
                              item: item,
                              subId: item.subId(order.orderNumber),
                              editable: true,
                              onTap: () => openCatalogItemSheet(context, order, existingItem: item),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

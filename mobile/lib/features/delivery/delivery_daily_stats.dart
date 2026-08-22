import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show authStateProvider;
import '../../core/services/orders_repository.dart';

final itemsForDayStatsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

bool isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

class DeliveryDayStats {
  /// Shu dastavchi o'zi mijozdan olib kelgan buyurtmalar (order-darajasida).
  final List<Order> pickedUpOrders;
  final num pickedUpTotal;

  /// Shu dastavchi o'zi mijozga yetkazgan MAHSULOTLAR soni (item-darajasida
  /// — qisman yetkazish tufayli buyurtma emas, mahsulot hisoblanadi) va
  /// ularning umumiy narxi, lekin ro'yxatda ko'rsatish uchun tegishli
  /// (takrorlanmagan) buyurtmalar.
  final int deliveredItemCount;
  final num deliveredTotal;
  final List<Order> deliveredOrders;

  const DeliveryDayStats({
    required this.pickedUpOrders,
    required this.pickedUpTotal,
    required this.deliveredItemCount,
    required this.deliveredTotal,
    required this.deliveredOrders,
  });
}

/// Berilgan kun uchun shu xodimning o'zi bajargan olib kelish/yetkazish
/// statistikasi — boshqa dastavchiklarniki emas, faqat shu xodimga
/// tegishli (talab). `recentOrdersProvider`dagi cheklangan oyna (60 ta
/// eng yangi buyurtma) ustida hisoblanadi — hech qachon butun jamlanma
/// yuklanmaydi degan umumiy naqshga mos.
DeliveryDayStats computeDeliveryDayStats(WidgetRef ref, List<Order> allOrders, String employeeId, DateTime day) {
  final pickedUpOrders = <Order>[];
  num pickedUpTotal = 0;
  final deliveredOrders = <Order>[];
  final seenDeliveredOrderIds = <String>{};
  num deliveredTotal = 0;
  var deliveredItemCount = 0;

  for (final order in allOrders) {
    if (order.serviceType != 'pickup') continue;

    if (order.pickedUpBy == employeeId && order.pickedUpAt != null && isSameDay(order.pickedUpAt!, day)) {
      pickedUpOrders.add(order);
      pickedUpTotal += order.totalPrice;
    }

    final items = ref.watch(itemsForDayStatsProvider(order.id)).valueOrNull ?? const <OrderItem>[];
    for (final item in items) {
      if (item.deliveredBy == employeeId && item.deliveredAt != null && isSameDay(item.deliveredAt!, day)) {
        deliveredItemCount++;
        deliveredTotal += item.price;
        if (seenDeliveredOrderIds.add(order.id)) deliveredOrders.add(order);
      }
    }
  }

  return DeliveryDayStats(
    pickedUpOrders: pickedUpOrders,
    pickedUpTotal: pickedUpTotal,
    deliveredItemCount: deliveredItemCount,
    deliveredTotal: deliveredTotal,
    deliveredOrders: deliveredOrders,
  );
}

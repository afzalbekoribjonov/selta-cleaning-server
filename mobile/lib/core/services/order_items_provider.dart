import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../models/order_item.dart';
import 'auth_service.dart' show authStateProvider;
import 'orders_repository.dart';

/// Bitta buyurtmaning mahsulotlari — ro'yxat kartalarida ham, tafsilot
/// varaqlarida ham baham ko'riladigan YAGONA provider. Riverpod bir xil
/// `orderId` uchun oqimni qayta ishlatadi, shuning uchun bir nechta joyda
/// kuzatilsa ham Firestore'ga bitta obuna ketadi.
///
/// `autoDispose` MAJBURIY: ro'yxatda yuzlab karta bo'lishi mumkin va har
/// biri o'z obunasini ochadi. Usiz karta ekrandan chiqib ketgach ham
/// obuna abadiy ochiq qolib, sekin-asta yuzlab keraksiz Firestore
/// listener to'planib qolardi.
final orderItemsProvider = StreamProvider.autoDispose.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

/// Buyurtmaning AMALDAGI muddati.
///
/// Olib kelish (pickup) buyurtmalarida tarif/muddat ITEM darajasida
/// (server: createOrder) — `order.dueDate` faqat joyida yuvish (onsite)
/// uchun mavjud. Shuning uchun pickup'da hali yakunlanmagan mahsulotlar
/// orasidan eng YAQIN muddat olinadi (talab: "eng birinchi kuni yaqin
/// mahsulotni sanasini ko'rsatish").
DateTime? effectiveDueDate(Order order, List<OrderItem> items) {
  if (order.serviceType == 'onsite') return order.dueDate;
  DateTime? earliest;
  for (final item in items) {
    if (item.isDone || item.dueDate == null) continue;
    if (earliest == null || item.dueDate!.isBefore(earliest)) earliest = item.dueDate;
  }
  return earliest;
}

/// Muddatgacha qolgan to'liq kunlar — manfiy bo'lsa kechikkan. Kun
/// chegarasi bo'yicha (soat-daqiqa emas): bugun = 0, ertaga = 1.
int daysUntil(DateTime due) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final target = DateTime(due.year, due.month, due.day);
  return target.difference(today).inDays;
}

/// "Bugun" / "Ertaga" / "3 kun qoldi" / "2 kun kechikdi".
String dueLabelUz(DateTime due) {
  final d = daysUntil(due);
  if (d == 0) return 'Bugun';
  if (d == 1) return 'Ertaga';
  if (d > 1) return '$d kun qoldi';
  return '${d.abs()} kun kechikdi';
}

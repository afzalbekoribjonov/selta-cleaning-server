import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../models/order_item.dart';
import '../sync/action_queue.dart';
import '../sync/overlay.dart';
import 'auth_service.dart' show authStateProvider;
import 'orders_repository.dart';

/// SERVERDAGI mahsulotlar — Firestore obunasi. Ekranlar buni to'g'ridan-
/// to'g'ri emas, navbat qo'llangan [orderItemsProvider] orqali o'qiydi.
///
/// `autoDispose` MAJBURIY: ro'yxatda yuzlab karta bo'lishi mumkin va har
/// biri o'z obunasini ochadi. Usiz karta ekrandan chiqib ketgach ham
/// obuna abadiy ochiq qolib, sekin-asta yuzlab keraksiz Firestore
/// listener to'planib qolardi.
final _baseOrderItemsProvider = StreamProvider.autoDispose.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);

  // Buyurtma yopilgandan keyin obuna yana bir necha daqiqa yashaydi: xodim
  // ko'pincha bitta buyurtmani qayta-qayta ochadi va har safar Firestore'ga
  // yangidan ulanish kechikish hamda qo'shimcha trafik berardi. Shu oraliqda
  // qayta ochilsa — ro'yxat darhol, yangi ulanishsiz chiqadi.
  final link = ref.keepAlive();
  Timer? release;
  ref.onCancel(() => release = Timer(const Duration(minutes: 3), link.close));
  ref.onResume(() => release?.cancel());
  ref.onDispose(() => release?.cancel());

  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

/// Bitta buyurtmaning mahsulotlari — barcha tafsilot oynalari shu YAGONA
/// providerdan oladi: bir xil buyurtma uchun Firestore'ga bitta obuna,
/// ustiga navbatdagi (hali serverga yetmagan) o'zgarishlar qo'yilgan.
///
/// Avval har bir oyna o'z `StreamProvider.family`ini e'lon qilardi —
/// `autoDispose`SIZ. Natijada xodim ochgan HAR BIR buyurtmaning obunasi
/// ilova yopilguncha ochiq qolardi (kun oxiriga kelib o'nlab doimiy
/// ulanish va ortiqcha trafik), bir xil buyurtma esa turli oynalardan
/// ochilganda ikki-uch marta alohida obuna bo'lardi.
final orderItemsProvider = Provider.autoDispose.family<AsyncValue<List<OrderItem>>, String>((ref, orderId) {
  final base = ref.watch(_baseOrderItemsProvider(orderId));
  final actions = ref.watch(actionQueueProvider);
  return base.whenData((items) => applyToItems(orderId, items, actions));
});

/// Buyurtmaning AMALDAGI muddati.
///
/// Olib kelish (pickup) buyurtmalarida tarif/muddat ITEM darajasida
/// (server: createOrder) — `order.dueDate` faqat joyida yuvish (onsite)
/// uchun mavjud. Pickup'da qiymat endi buyurtmaning O'ZIDAN o'qiladi:
/// server uni mahsulot o'zgarganda hisoblab yozib qo'yadi
/// (server/src/lib/orderSummary.ts). Avval bu yerda har bir karta uchun
/// mahsulotlar ro'yxati o'qilardi — bu Firestore kunlik o'qish limitini
/// tugatib qo'ygan asosiy sabablardan biri edi.
DateTime? effectiveDueDate(Order order) {
  if (order.serviceType == 'onsite') return order.dueDate;
  return order.earliestPendingDueDate;
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

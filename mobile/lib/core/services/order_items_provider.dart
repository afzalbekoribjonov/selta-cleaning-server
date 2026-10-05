import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../models/order_item.dart';
import '../sync/action_queue.dart';
import '../sync/overlay.dart';
import 'auth_service.dart' show authStateProvider;
import 'connectivity_service.dart';
import 'orders_repository.dart';

/// Obuna ekrandan chiqqandan keyin yana bir necha daqiqa yashaydi: xodim
/// ko'pincha bitta buyurtmani qayta-qayta ochadi va har safar Firestore'ga
/// yangidan ulanish kechikish hamda qo'shimcha trafik berardi.
void _keepAliveBriefly(Ref ref) {
  final link = ref.keepAlive();
  Timer? release;
  ref.onCancel(() => release = Timer(const Duration(minutes: 3), link.close));
  ref.onResume(() => release?.cancel());
  ref.onDispose(() => release?.cancel());
}

/// Ro'yxatlarda yo'q buyurtmaning hujjati (masalan qidiruvdan ochilgan).
final _orderDocProvider = StreamProvider.autoDispose.family<Order?, String>((ref, orderId) {
  ref.watch(authStateProvider);
  _keepAliveBriefly(ref);
  // `read` — aylanma bog'liqlik bo'lmasligi uchun (orders_repository.dart'ga qarang).
  return ref.read(ordersRepositoryProvider).watchOrder(orderId);
});

/// Bitta buyurtmaning JONLI holati (navbat qo'llangan) — tafsilot oynalari
/// shuni kuzatadi: ochilgan paytdagi nusxa emas, har qanday o'zgarish
/// (oldindan to'lov, bonus, holat, boshqa xodimning amali) darhol
/// ko'rinadi. Avval ro'yxatdan qidiriladi (qo'shimcha o'qishsiz), topilmasa
/// hujjatning o'ziga obuna bo'linadi.
final liveOrderProvider = Provider.autoDispose.family<Order?, String>((ref, orderId) {
  for (final o in ref.watch(ordersProvider).valueOrNull ?? const <Order>[]) {
    if (o.id == orderId) return o;
  }
  final doc = ref.watch(_orderDocProvider(orderId)).valueOrNull;
  if (doc == null) return null;
  return applyToOrders([doc], ref.watch(actionQueueProvider)).firstOrNull;
});

/// Mahsulotlar internetsiz va qurilma keshida ham yo'q — "mahsulot yo'q"
/// deb adashtirmaslik uchun alohida holat.
class ItemsUnavailableOffline implements Exception {
  const ItemsUnavailableOffline();

  @override
  String toString() => "Internet yo'q — mahsulotlar hali yuklanmagan";
}

/// SERVERDAGI mahsulotlar — Firestore obunasi. Faqat buyurtmada mahsulotlar
/// nusxasi bo'lmaganda (eski buyurtma) ishlatiladi.
///
/// `autoDispose` MAJBURIY: aks holda ochilgan har bir buyurtmaning obunasi
/// ilova yopilguncha ochiq qolib, keraksiz listener to'planardi.
final _baseOrderItemsProvider =
    StreamProvider.autoDispose.family<({List<OrderItem> items, bool fromCache}), String>((ref, orderId) {
  ref.watch(authStateProvider);
  _keepAliveBriefly(ref);
  // `read` — repozitoriy yozishda shu providerni o'qiydi (`_items`);
  // `watch` aylanma bog'liqlik hosil qilardi (orders_repository.dart'ga qarang).
  return ref.read(ordersRepositoryProvider).watchItems(orderId);
});

/// Bitta buyurtmaning mahsulotlari — barcha tafsilot oynalari shu YAGONA
/// providerdan oladi, ustiga navbatdagi (hali serverga yetmagan)
/// o'zgarishlar qo'yilgan.
///
/// Asosiy manba — buyurtmadagi mahsulotlar NUSXASI (`itemsMirror`): u
/// buyurtmalar ro'yxati bilan birga keladi va keshlanadi, shuning uchun
/// mahsulotlar oyna ochilishi bilan, internetsiz ham ko'rinadi va
/// qo'shimcha Firestore o'qishi bo'lmaydi. Nusxa yo'q eski buyurtmada —
/// avvalgidek `items` pastki jamlanmasiga obuna.
final orderItemsProvider = Provider.autoDispose.family<AsyncValue<List<OrderItem>>, String>((ref, orderId) {
  final actions = ref.watch(actionQueueProvider);
  final mirror = ref.watch(liveOrderProvider(orderId))?.itemsMirror;
  if (mirror != null) return AsyncData(applyToItems(orderId, mirror, actions));

  final base = ref.watch(_baseOrderItemsProvider(orderId));
  final value = base.valueOrNull;
  if (value != null && value.fromCache && value.items.isEmpty) {
    // Kesh bo'sh: internet bo'lsa server javobi kutiladi, bo'lmasa aytiladi.
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final pending = applyToItems(orderId, const [], actions);
    if (pending.isNotEmpty) return AsyncData(pending);
    return online ? const AsyncLoading() : const AsyncError(ItemsUnavailableOffline(), StackTrace.empty);
  }
  return base.whenData((v) => applyToItems(orderId, v.items, actions));
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

import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/delivery/delivery_buckets.dart' show remainingItems, warehouseItemsOf;
import '../models/order.dart';
import 'orders_repository.dart';
import 'warehouse_settings.dart';

/// Faol ro'yxatlar uchun buyurtmalar — OMBORXONADAGI mahsulotlarsiz.
///
/// Talab: omborga tushgan buyurtma (mahsulot) dastavchikda ham, "yetkazishga
/// tayyor" ro'yxatlarida ham, ko'rsatkichlarda ham ko'rinmaydi — faqat
/// Omborxonada turadi. Shuning uchun:
///  - qolgan HAMMA mahsuloti omborda bo'lgan buyurtma ro'yxatdan chiqadi;
///  - qisman omborda bo'lsa, ombordagilar buyurtma nusxasidan va "tayyor"
///    sonidan olib tashlanadi (karta, topshirish oynasi, topshiriq — hammasi
///    faqat qolganlarini ko'radi).
///
/// Bu FAQAT ko'rinish: Omborxona, qidiruv va buyurtma ichki kartasi to'liq
/// buyurtmani ([ordersProvider]) ko'radi.
final activeOrdersProvider = Provider<AsyncValue<List<Order>>>((ref) {
  final orders = ref.watch(ordersProvider);
  final days = ref.watch(warehouseReadyDaysProvider).valueOrNull ?? kDefaultWarehouseReadyDays;
  // Kun almashganda (yarim tunda) mahsulot omborga o'tadi — qayta hisoblash.
  ref.watch(_dayTickProvider);
  return orders.whenData((list) => withoutWarehouse(list, days, DateTime.now()));
});

/// Har kuni yarim tunda bir marta yangilanadi.
final _dayTickProvider = StreamProvider<int>((ref) {
  final controller = StreamController<int>();
  Timer? timer;
  void schedule() {
    final now = DateTime.now();
    final next = DateTime(now.year, now.month, now.day + 1, 0, 0, 5);
    timer = Timer(next.difference(now), () {
      controller.add(DateTime.now().day);
      schedule();
    });
  }

  controller.add(DateTime.now().day);
  schedule();
  ref.onDispose(() {
    timer?.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Toza funksiya — sinovlar uchun ochiq.
List<Order> withoutWarehouse(List<Order> orders, int days, DateTime now) {
  final out = <Order>[];
  for (final o in orders) {
    final inWarehouse = warehouseItemsOf(o, days, now);
    if (inWarehouse.isEmpty) {
      out.add(o);
      continue;
    }
    // Qolgan hammasi omborda — faqat Omborxonada.
    if (inWarehouse.length >= remainingItems(o)) continue;
    final ids = {for (final i in inWarehouse) i.id};
    final counts = Map<String, int>.from(o.itemStatusCounts);
    counts['ready'] = max(0, (counts['ready'] ?? 0) - inWarehouse.length);
    if (counts['ready'] == 0) counts.remove('ready');
    out.add(o.copyWith(
      itemsMirror: [for (final i in o.itemsMirror ?? const []) if (!ids.contains(i.id)) i],
      itemStatusCounts: counts,
    ));
  }
  return out;
}

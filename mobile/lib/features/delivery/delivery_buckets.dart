import 'dart:math';

import '../../core/models/order.dart';
import '../../core/services/order_items_provider.dart';

/// Dastavchik bo'limlari — qaysi buyurtma qayerga tushadi va qanday
/// saralanadi. Toza funksiyalar: faqat buyurtma xulosasidan
/// (`itemStatusCounts`) hisoblanadi, mahsulotlarni o'qimaydi.

/// Hali yetkazilmagan mahsulotlar soni.
int remainingItems(Order o) =>
    o.itemStatusCounts.entries.where((e) => e.key != 'done').fold<int>(0, (s, e) => s + e.value);

int readyItems(Order o) => o.itemStatusCounts['ready'] ?? 0;

bool _inWorkshop(Order o) => o.serviceType == 'pickup' && o.status == 'brought_in';

/// "Yangi" — mijozdan olib kelinishi kerak.
bool isToPickUp(Order o) => o.serviceType == 'pickup' && o.status == 'new';

/// "Deyarli tayyor" — ba'zi mahsulotlar tayyor, qolgani hali ishlovda
/// (masalan 4 tadan 2 tasi). Tayyorlarini olib borish mumkin, lekin
/// qolganini kutib birga olib borish ham mumkin — dastavchik o'zi hal qiladi.
bool isAlmostReady(Order o) {
  if (!_inWorkshop(o)) return false;
  final ready = readyItems(o);
  return ready > 0 && ready < remainingItems(o);
}

/// "Tayyor" — qolgan mahsulotlarning HAMMASI tayyor.
bool isFullyReady(Order o) {
  if (!_inWorkshop(o)) return false;
  final remaining = remainingItems(o);
  return remaining > 0 && readyItems(o) == remaining;
}

enum DeliverySort { all, date, distance, due, priceHigh, priceLow }

const deliverySortLabels = {
  DeliverySort.all: 'Barchasi',
  DeliverySort.date: 'Sana',
  DeliverySort.distance: 'Masofa',
  DeliverySort.due: 'Topshirish kuni',
  DeliverySort.priceHigh: 'Eng qimmat',
  DeliverySort.priceLow: 'Eng arzon',
};

typedef LatLng = ({double lat, double lng});

/// "41.31,69.24" -> koordinata. Buzuq yozuv `null`.
LatLng? parseGps(String? raw) {
  if (raw == null) return null;
  final parts = raw.split(',');
  if (parts.length != 2) return null;
  final lat = double.tryParse(parts[0].trim());
  final lng = double.tryParse(parts[1].trim());
  if (lat == null || lng == null || lat.abs() > 90 || lng.abs() > 180) return null;
  return (lat: lat, lng: lng);
}

/// Ikki nuqta orasidagi TO'G'RI CHIZIQ masofasi (km) — Haversine.
///
/// Yo'l bo'yicha masofa pullik xarita xizmatini va internetni talab
/// qilardi; bu esa bepul, darhol va internetsiz ishlaydi. Shuning uchun
/// kartada "~" belgisi bilan ko'rsatiladi: yo'l biroz uzunroq bo'ladi.
double distanceKm(LatLng a, LatLng b) {
  const earthRadiusKm = 6371.0;
  double rad(double deg) => deg * pi / 180;
  final dLat = rad(b.lat - a.lat);
  final dLng = rad(b.lng - a.lng);
  final h = sin(dLat / 2) * sin(dLat / 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * sin(dLng / 2) * sin(dLng / 2);
  return 2 * earthRadiusKm * asin(sqrt(h));
}

/// "~850 m" / "~4.2 km" / "~18 km".
String formatDistance(double km) {
  if (km < 1) return '~${(km * 1000 / 10).round() * 10} m';
  if (km < 10) return '~${km.toStringAsFixed(1)} km';
  return '~${km.round()} km';
}

/// Tanlangan tartib bo'yicha saralash. "Masofa"da GPS'i yo'q buyurtmalar
/// ro'yxatdan chiqariladi (ularni masofa bo'yicha joylab bo'lmaydi) —
/// chaqiruvchi nechta chiqarilganini ko'rsatadi.
List<Order> sortDeliveryOrders(List<Order> orders, DeliverySort sort, {LatLng? from}) {
  final list = [...orders];
  int byCreatedAsc(Order a, Order b) => a.createdAt.compareTo(b.createdAt);
  switch (sort) {
    case DeliverySort.all:
      // Navbat tartibi — eng avval qabul qilingani birinchi.
      list.sort(byCreatedAsc);
    case DeliverySort.date:
      list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    case DeliverySort.due:
      // Muddati eng yaqin (yoki o'tib ketgan) birinchi; muddatsizlari oxirida.
      list.sort((a, b) {
        final da = effectiveDueDate(a);
        final db = effectiveDueDate(b);
        if (da == null && db == null) return byCreatedAsc(a, b);
        if (da == null) return 1;
        if (db == null) return -1;
        return da.compareTo(db);
      });
    case DeliverySort.priceHigh:
      list.sort((a, b) => b.totalPrice.compareTo(a.totalPrice));
    case DeliverySort.priceLow:
      list.sort((a, b) => a.totalPrice.compareTo(b.totalPrice));
    case DeliverySort.distance:
      if (from == null) return list..sort(byCreatedAsc);
      final withGps = <(Order, double)>[];
      for (final o in list) {
        final p = parseGps(o.gpsCoords);
        if (p != null) withGps.add((o, distanceKm(from, p)));
      }
      withGps.sort((a, b) => a.$2.compareTo(b.$2));
      return [for (final e in withGps) e.$1];
  }
  return list;
}

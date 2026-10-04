import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/features/delivery/delivery_buckets.dart';

Order order(
  String id, {
  String status = 'brought_in',
  String service = 'pickup',
  Map<String, int> counts = const {},
  num price = 100000,
  String? gps,
  DateTime? created,
  DateTime? due,
}) =>
    Order(
      id: id,
      orderNumber: 1,
      customerName: id,
      phone: '',
      location: '',
      serviceType: service,
      status: status,
      createdBy: 'e',
      createdAt: created ?? DateTime(2026, 10, 1),
      itemStatusCounts: counts,
      totalPrice: price,
      gpsCoords: gps,
      earliestPendingDueDate: due,
    );

void main() {
  group('bo\'limlarga taqsimlash', () {
    test('Yangi — faqat olib kelinishi kerak bo\'lgan pickup', () {
      expect(isToPickUp(order('a', status: 'new')), isTrue);
      expect(isToPickUp(order('b', status: 'new', service: 'onsite')), isFalse);
      expect(isToPickUp(order('c')), isFalse);
    });

    test('4 tadan 2 tasi tayyor — Deyarli tayyor', () {
      final o = order('a', counts: {'ready': 2, 'washing': 1, 'packing': 1});
      expect(isAlmostReady(o), isTrue);
      expect(isFullyReady(o), isFalse);
    });

    test('qolganlarning hammasi tayyor — Tayyor (oldin yetkazilganlari hisobga olinmaydi)', () {
      final o = order('a', counts: {'ready': 2, 'done': 2});
      expect(isFullyReady(o), isTrue);
      expect(isAlmostReady(o), isFalse);
    });

    test('hech biri tayyor emas — ikkalasida ham yo\'q', () {
      final o = order('a', counts: {'washing': 3});
      expect(isAlmostReady(o), isFalse);
      expect(isFullyReady(o), isFalse);
    });

    test('hammasi yetkazilgan — Tayyor emas', () {
      expect(isFullyReady(order('a', counts: {'done': 3})), isFalse);
    });

    test('joyida yuvish buyurtmasi bu bo\'limlarga tushmaydi', () {
      expect(isFullyReady(order('a', service: 'onsite', counts: {'ready': 1})), isFalse);
    });
  });

  group('masofa', () {
    test('GPS satri', () {
      expect(parseGps('41.311,69.279'), (lat: 41.311, lng: 69.279));
      expect(parseGps(' 41.3 , 69.2 '), (lat: 41.3, lng: 69.2));
      expect(parseGps('xato'), isNull);
      expect(parseGps('91,10'), isNull);
      expect(parseGps(null), isNull);
    });

    test('Toshkent: Chorsu — Amir Temur xiyoboni ~4 km', () {
      final km = distanceKm((lat: 41.3265, lng: 69.2353), (lat: 41.3111, lng: 69.2797));
      expect(km, closeTo(4.0, 0.3));
    });

    test('ko\'rinishi', () {
      expect(formatDistance(0.437), '~440 m');
      expect(formatDistance(4.23), '~4.2 km');
      expect(formatDistance(18.6), '~19 km');
    });
  });

  group('saralash', () {
    final a = order('a', price: 300000, created: DateTime(2026, 10, 1), due: DateTime(2026, 10, 9), gps: '41.30,69.24');
    final b = order('b', price: 100000, created: DateTime(2026, 10, 3), due: DateTime(2026, 10, 4));
    final c = order('c', price: 200000, created: DateTime(2026, 10, 2), gps: '41.40,69.30');
    final list = [b, c, a];

    List<String> ids(List<Order> l) => l.map((o) => o.id).toList();

    test('Barchasi — navbat tartibi (eng avval qabul qilingani birinchi)', () {
      expect(ids(sortDeliveryOrders(list, DeliverySort.all)), ['a', 'c', 'b']);
    });

    test('Sana — eng yangisi birinchi', () {
      expect(ids(sortDeliveryOrders(list, DeliverySort.date)), ['b', 'c', 'a']);
    });

    test('Topshirish kuni — eng yaqin muddat birinchi, muddatsiz oxirida', () {
      expect(ids(sortDeliveryOrders(list, DeliverySort.due)), ['b', 'a', 'c']);
    });

    test('Eng qimmat / Eng arzon', () {
      expect(ids(sortDeliveryOrders(list, DeliverySort.priceHigh)), ['a', 'c', 'b']);
      expect(ids(sortDeliveryOrders(list, DeliverySort.priceLow)), ['b', 'c', 'a']);
    });

    test('Masofa — eng yaqini birinchi, GPS\'sizlar chiqariladi', () {
      final out = sortDeliveryOrders(list, DeliverySort.distance, from: (lat: 41.30, lng: 69.24));
      expect(ids(out), ['a', 'c']);
    });

    test('Masofa — joylashuv hali noma\'lum bo\'lsa ro\'yxat yo\'qolmaydi', () {
      expect(sortDeliveryOrders(list, DeliverySort.distance).length, 3);
    });
  });


  group('omborxona', () {
    final now = DateTime(2026, 10, 20, 15);
    Order late(int days, {Map<String, int> counts = const {'ready': 2}}) =>
        order('w', counts: counts, due: DateTime(2026, 10, 20 - days, 9));

    test('kartadagi "N kun kechikdi" bilan bir xil hisob', () {
      expect(daysLate(late(11), now), 11);
      expect(daysLate(late(0), now), 0);
    });

    test('chegara: 10 kun kechikkan hali omborda emas, 11 kun omborda', () {
      expect(isInWarehouse(late(10), 10, now), isFalse);
      expect(isInWarehouse(late(11), 10, now), isTrue);
    });

    test('hammasi tayyor bo\'lmasa omborga tushmaydi', () {
      expect(isInWarehouse(late(30, counts: const {'ready': 1, 'washing': 1}), 10, now), isFalse);
    });

    test('muddati yo\'q buyurtma omborga tushmaydi', () {
      expect(isInWarehouse(order('x', counts: const {'ready': 1}), 10, now), isFalse);
    });

    test('chegara admin sozlamasiga bo\'ysunadi', () {
      expect(isInWarehouse(late(6), 5, now), isTrue);
      expect(isInWarehouse(late(6), 30, now), isFalse);
    });
  });
}

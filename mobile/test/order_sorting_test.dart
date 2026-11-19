import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/services/active_orders.dart';
import 'package:selta_cleaning/features/shared/order_sorting.dart';

OrderItem item(String id, {String status = 'washing', String? tariff, DateTime? packedAt}) => OrderItem(
      id: id,
      itemNumber: id.codeUnitAt(0) - 96,
      name: id,
      area: 0,
      price: 50000,
      qcStatus: 'passed',
      status: status,
      tariff: tariff,
      packedAt: packedAt,
    );

Order order(
  String id, {
  String status = 'brought_in',
  String service = 'pickup',
  String? tariff,
  num price = 100000,
  DateTime? created,
  DateTime? due,
  List<OrderItem>? items,
}) {
  final counts = <String, int>{};
  for (final i in items ?? const <OrderItem>[]) {
    counts[i.status!] = (counts[i.status!] ?? 0) + 1;
  }
  return Order(
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
    tariff: tariff,
    earliestPendingDueDate: due,
    itemsMirror: items,
  );
}

void main() {
  group('tarif ko\'rsatkichlari', () {
    test('faol buyurtmada faqat topshirilmagan mahsulotlar sanaladi', () {
      final o = order('a', items: [
        item('a', tariff: 'premium'),
        item('b', tariff: 'express'),
        item('c', tariff: 'express'),
        item('d', tariff: 'standart', status: 'done'),
      ]);
      expect(tariffCountsOf(o), {'premium': 1, 'express': 2});
    });

    test("mahsulot tarifsiz bo'lsa buyurtma tarifi olinadi; 'standard' → 'standart'", () {
      final o = order('a', tariff: 'standard', items: [item('a'), item('b', tariff: 'comfort')]);
      expect(tariffCountsOf(o), {'standart': 1, 'comfort': 1});
    });

    test("mahsulotsiz joyida yuvish — buyurtmaning o'z tarifi (soni 0)", () {
      final o = order('a', service: 'onsite', tariff: 'express');
      expect(tariffCountsOf(o), {'express': 0});
    });

    test('yakunlangan buyurtmada hammasi sanaladi', () {
      final o = order('a', status: 'done', items: [item('a', tariff: 'premium', status: 'done')]);
      expect(tariffCountsOf(o), {'premium': 1});
    });
  });

  group('saralash', () {
    final premium = order('premium', items: [item('a', tariff: 'premium')], due: DateTime(2026, 10, 5));
    final express = order('express', items: [item('a', tariff: 'express')], due: DateTime(2026, 10, 5));
    final comfort = order('comfort', items: [item('a', tariff: 'comfort')], due: DateTime(2026, 10, 3));
    final standart = order('standart', items: [item('a', tariff: 'standart')], due: DateTime(2026, 10, 2));
    final mixed = order('mixed', items: [item('a', tariff: 'standart'), item('b', tariff: 'premium')], due: DateTime(2026, 10, 4));

    test('Premium → Express → Comfort → Standart; muddat bir xil bo\'lsa ham Premium oldinda', () {
      final sorted = sortOrders([standart, comfort, express, premium], OrderSort.tariff);
      expect(sorted.map((o) => o.id), ['premium', 'express', 'comfort', 'standart']);
    });

    test('aralash buyurtma eng ustun tarifi bo\'yicha; bir xil tarifda — muddati yaqini birinchi', () {
      final sorted = sortOrders([premium, express, mixed], OrderSort.tariff);
      expect(sorted.map((o) => o.id), ['mixed', 'premium', 'express']);
    });

    test('sana va narx bo\'yicha', () {
      final a = order('a', created: DateTime(2026, 10, 1), price: 300);
      final b = order('b', created: DateTime(2026, 10, 3), price: 100);
      final c = order('c', created: DateTime(2026, 10, 2), price: 200);
      expect(sortOrders([a, b, c], OrderSort.newest).map((o) => o.id), ['b', 'c', 'a']);
      expect(sortOrders([a, b, c], OrderSort.oldest).map((o) => o.id), ['a', 'c', 'b']);
      expect(sortOrders([a, b, c], OrderSort.priceHigh).map((o) => o.id), ['a', 'c', 'b']);
      expect(sortOrders([a, b, c], OrderSort.priceLow).map((o) => o.id), ['b', 'c', 'a']);
    });

    test('asl ro\'yxat o\'zgarmaydi', () {
      final list = [standart, premium];
      sortOrders(list, OrderSort.tariff);
      expect(list.first.id, 'standart');
    });
  });

  group('omborxona faol ro\'yxatlardan chiqariladi', () {
    final now = DateTime(2026, 10, 20, 15);
    DateTime ago(int days) => DateTime(2026, 10, 20 - days, 10);

    test('hamma qolgan mahsuloti omborda — buyurtma ro\'yxatda yo\'q', () {
      final o = order('w', items: [
        item('a', status: 'ready', packedAt: ago(6)),
        item('b', status: 'done', packedAt: ago(9)),
      ]);
      expect(withoutWarehouse([o], 5, now), isEmpty);
    });

    test('qisman omborda — ombordagilar nusxadan va "tayyor" sonidan olinadi', () {
      final o = order('p', items: [
        item('a', status: 'ready', packedAt: ago(6)),
        item('b', status: 'ready', packedAt: ago(1)),
        item('c', status: 'washing'),
      ]);
      final out = withoutWarehouse([o], 5, now);
      expect(out, hasLength(1));
      expect(out.single.itemsMirror!.map((i) => i.id), ['b', 'c']);
      expect(out.single.itemStatusCounts, {'ready': 1, 'washing': 1});
    });

    test("yagona tayyor mahsulot omborda bo'lsa 'ready' kaliti olib tashlanadi", () {
      final o = order('p', items: [item('a', status: 'ready', packedAt: ago(7)), item('c', status: 'packing')]);
      final out = withoutWarehouse([o], 5, now).single;
      expect(out.itemStatusCounts.containsKey('ready'), isFalse);
      expect(out.itemStatusCounts['packing'], 1);
    });

    test('omborga hali tushmagan va joyida yuvish buyurtmalari tegilmaydi', () {
      final fresh = order('f', items: [item('a', status: 'ready', packedAt: ago(2))]);
      final onsite = order('o', service: 'onsite', tariff: 'express');
      final out = withoutWarehouse([fresh, onsite], 5, now);
      expect(out, [same(fresh), same(onsite)]);
    });
  });

  testWidgets('TariffDots — bitta qatorda rangli nuqta va son', (tester) async {
    final o = order('a', items: [
      item('a', tariff: 'standart'),
      item('b', tariff: 'premium'),
      item('c', tariff: 'premium'),
    ]);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: TariffDots(order: o))));
    expect(find.text('2'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    // Premium birinchi turadi.
    final premiumX = tester.getTopLeft(find.text('2')).dx;
    final standartX = tester.getTopLeft(find.text('1')).dx;
    expect(premiumX, lessThan(standartX));
    expect(find.byTooltip('Premium'), findsOneWidget);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/features/shared/order_copy.dart';

Order order({int number = 1245}) => Order(
      id: 'o1',
      orderNumber: number,
      customerName: 'Aziz Karimov',
      phone: '+998901234567',
      location: 'Yunusobod',
      serviceType: 'pickup',
      status: 'brought_in',
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      totalPrice: 440000,
    );

final items = [
  const OrderItem(
    id: 'a',
    itemNumber: 1,
    name: 'Gilam',
    area: 12,
    price: 360000,
    qcStatus: 'pending',
    calcType: 'sqm',
    qty: 12,
    width: 3,
    height: 4,
  ),
  const OrderItem(id: 'b', itemNumber: 2, name: 'Parda', area: 0, price: 80000, qcStatus: 'pending', calcType: 'count', qty: 2),
];

void main() {
  test("to'liq nusxa — tartibli va faqat buyurtma ma'lumoti", () {
    expect(
      formatOrderForCopy(order(), items),
      'Buyurtma #1245\n'
      'Mijoz: Aziz Karimov\n'
      'Telefon: +998 90 123 45 67\n'
      '\n'
      'Mahsulotlar (2):\n'
      "1. 1245/1 · Gilam — 12.00 m² (3×4) — 360 000 so'm\n"
      "2. 1245/2 · Parda — 2 dona — 80 000 so'm\n"
      '\n'
      "Jami: 440 000 so'm",
    );
  });

  test("mahsulotsiz buyurtma — jami buyurtma summasidan", () {
    final text = formatOrderForCopy(order(), const []);
    expect(text, isNot(contains('Mahsulotlar')));
    expect(text, endsWith("Jami: 440 000 so'm"));
  });

  test('raqami hali berilmagan (oflayn) buyurtmada "0/1" kabi ID chiqmaydi', () {
    final text = formatOrderForCopy(order(number: 0), items);
    expect(text, startsWith('Buyurtma #…'));
    expect(text, isNot(contains('0/1')));
  });

  testWidgets('tugma bosilganda buferga yozadi va ✓ ko\'rsatadi', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopyOrderButton(order: order(), items: items))));
    await tester.tap(find.byIcon(Icons.copy_rounded));
    await tester.pump();
    expect(copied, startsWith('Buyurtma #1245'));
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    expect(find.byIcon(Icons.copy_rounded), findsOneWidget);
  });

  testWidgets('mahsulotlar yuklanmagan bo\'lsa tugma o\'chiq', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopyOrderButton(order: order(), items: null))));
    final button = tester.widget<IconButton>(find.byType(IconButton));
    expect(button.onPressed, isNull);
  });
}

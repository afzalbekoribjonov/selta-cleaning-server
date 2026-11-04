import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/utils/money_utils.dart';
import 'package:selta_cleaning/core/utils/phone_format.dart';
import 'package:selta_cleaning/core/widgets/employee_avatar.dart';

OrderItem _item(String id, num price, String status) =>
    OrderItem(id: id, itemNumber: 1, name: id, area: 0, price: price, qcStatus: 'passed', status: status);

Order _order({List<OrderItem>? items, num total = 300000, num prepaid = 0, num bonus = 0, num used = 0}) => Order(
      id: 'o',
      orderNumber: 1,
      customerName: 'A',
      phone: '',
      location: '',
      serviceType: 'pickup',
      status: 'brought_in',
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      totalPrice: total,
      prepaidAmount: prepaid,
      bonusAmount: bonus,
      prepaidUsed: used,
      itemsMirror: items,
    );

void main() {
  group('yetkazishda yig\'iladigan summa', () {
    test('oldindan to\'lov ayiriladi', () {
      final o = _order(items: [_item('a', 200000, 'ready'), _item('b', 100000, 'ready')], prepaid: 120000);
      expect(o.collectibleAmount, 180000);
    });

    test('avval topshirilgan mahsulot yana so\'ralmaydi', () {
      final o = _order(items: [_item('a', 200000, 'done'), _item('b', 100000, 'ready')]);
      expect(o.collectibleAmount, 100000);
    });

    test('ishlatilgan oldindan to\'lov qayta ayirilmaydi; bonus ham hisobga olinadi', () {
      final o = _order(
        items: [_item('a', 200000, 'done'), _item('b', 100000, 'ready')],
        prepaid: 150000,
        bonus: 20000,
        used: 150000,
      );
      expect(o.collectibleAmount, 80000);
    });

    test('ortiqcha to\'langan bo\'lsa 0 (manfiy emas)', () {
      expect(_order(items: [_item('a', 50000, 'ready')], prepaid: 90000).collectibleAmount, 0);
    });

    test('mahsulotlar nusxasi bo\'lmasa — umumiy narxdan', () {
      expect(_order(total: 300000, prepaid: 100000).collectibleAmount, 200000);
    });
  });

  test('o\'lcham/miqdor formati: vergul, keraksiz nollarsiz, minglik bo\'shliq', () {
    expect(formatQtyUz(9.8), '9,8');
    expect(formatQtyUz(12.0), '12');
    expect(formatQtyUz(12.50), '12,5');
    expect(formatQtyUz(2.345), '2,35');
    expect(formatQtyUz(1250), '1 250');
    expect(formatQtyUz(3, decimals: 0), '3');
  });

  test('telefon: qisqa va to\'liq ko\'rinish', () {
    expect(formatPhoneShortUz('+998901234567'), '90 123 45 67');
    expect(formatPhoneUz('901234567'), '+998 90 123 45 67');
    expect(formatPhoneShortUz('123'), '123');
  });

  test('avatar bosh harflari', () {
    expect(initialsOf('Akmal Qodirov'), 'AQ');
    expect(initialsOf('  akmal  '), 'A');
    expect(initialsOf("Bobur Mirzo O'g'li"), 'BM');
    expect(initialsOf('...'), '');
    expect(initialsOf(''), '');
  });
}

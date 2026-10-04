import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/sync/overlay.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';

OrderItem item(String id, int n, String status, {num price = 100000, String? tariff = 'comfort', String? category}) =>
    OrderItem(
      id: id,
      itemNumber: n,
      name: 'Gilam $n',
      area: 4,
      price: price,
      qcStatus: 'pending',
      status: status,
      tariff: tariff,
      category: category,
    );

Order orderFrom(String id, List<OrderItem> items, {String status = 'brought_in'}) {
  final s = summarizeItems(items);
  return Order(
    id: id,
    orderNumber: 1245,
    customerName: 'Aziz',
    phone: '+998901234567',
    location: 'Yunusobod',
    serviceType: 'pickup',
    status: status,
    createdBy: 'emp1',
    createdAt: DateTime(2026, 10, 1),
    totalPrice: s['totalPrice'] as num,
    zeroPriceItemCount: s['zeroPriceItemCount'] as int,
    itemStatusCounts: Map<String, int>.from(s['itemStatusCounts'] as Map),
  );
}

PendingAction action(String orderId, Map<String, dynamic> effect, {bool failed = false}) => PendingAction(
      id: newActionId(),
      path: '/x',
      body: const {},
      orderId: orderId,
      effect: effect,
      label: '',
      createdAt: DateTime.now(),
      failed: failed,
    );

/// Mahsulot holati o'zgarishi — xuddi repozitoriy yaratadigandek.
PendingAction statusChange(Order base, List<OrderItem> items, String itemId, String to) {
  final after = [for (final i in items) i.id == itemId ? i.copyWith(status: to) : i];
  return action(base.id, {
    'kind': EffectKind.itemsChange,
    'upserts': [itemToJson(after.firstWhere((i) => i.id == itemId))],
    'summary': summarizeItems(after),
    'base': orderSignature(base),
  });
}

void main() {
  group('summarizeItems — server bilan bir xil', () {
    test('sanoq, summa, nol narx va eng yaqin muddat', () {
      final now = DateTime(2026, 10, 5);
      final items = [
        item('a', 1, 'washing').copyWith(),
        item('b', 2, 'ready', price: 0),
        item('c', 3, 'done'),
        OrderItem(id: 'd', itemNumber: 4, name: 'x', area: 1, price: 50000, qcStatus: 'pending', status: 'washing', dueDate: now),
      ];
      final s = summarizeItems(items);
      expect(s['itemStatusCounts'], {'washing': 2, 'ready': 1, 'done': 1});
      expect(s['totalPrice'], 250000);
      // Yakunlangan mahsulot nol narxda bo'lsa ham hisobga kirmaydi.
      expect(s['zeroPriceItemCount'], 1);
      expect(s['earliestPendingDueDate'], now.millisecondsSinceEpoch);
    });

    test('toifasiz mahsulot server kabi "_none"ga tushadi', () {
      final s = summarizeItems([item('a', 1, 'washing', category: 'gilam'), item('b', 2, 'washing')]);
      expect((s['itemStageCategories'] as Map)['washing'], unorderedEquals(['gilam', '_none']));
    });
  });

  group('applyToOrders', () {
    final items = [item('a', 1, 'washing'), item('b', 2, 'washing')];
    final base = orderFrom('o1', items);

    test('navbat bo\'sh — ro\'yxat o\'zgarmaydi', () {
      expect(identical(applyToOrders([base], const []), [base]), isFalse);
      expect(applyToOrders([base], const []), [base]);
    });

    test('mahsulot holati sanoqqa darhol tushadi', () {
      final out = applyToOrders([base], [statusChange(base, items, 'a', 'packing')]).single;
      expect(out.itemStatusCounts, {'washing': 1, 'packing': 1});
      expect(out.pendingSync, isTrue);
    });

    test('server qo\'llagach IKKI MARTA qo\'shilmaydi', () {
      final pending = statusChange(base, items, 'a', 'packing');
      // Server amalni bajardi: Firestore'dagi buyurtma endi yangi sanoqda.
      final serverAfter = orderFrom('o1', [item('a', 1, 'packing'), item('b', 2, 'washing')]);
      final out = applyToOrders([serverAfter], [pending]).single;
      expect(out.itemStatusCounts, {'packing': 1, 'washing': 1});
    });

    test('ketma-ket oflayn amallar bir-birining ustiga quriladi', () {
      final a1 = statusChange(base, items, 'a', 'packing');
      final itemsAfterA1 = [item('a', 1, 'packing'), item('b', 2, 'washing')];
      // Ikkinchi amal ham ekrandagi (overlay qilingan) mahsulotlardan,
      // lekin server holati hali o'sha-o'sha.
      final after = [itemsAfterA1[0].copyWith(status: 'ready'), itemsAfterA1[1]];
      final a2 = action('o1', {
        'kind': EffectKind.itemsChange,
        'upserts': [itemToJson(after[0])],
        'summary': summarizeItems(after),
        'base': orderSignature(base),
      });
      final out = applyToOrders([base], [a1, a2]).single;
      expect(out.itemStatusCounts, {'ready': 1, 'washing': 1});
    });

    test('rad etilgan amal ekranda ko\'rsatilmaydi', () {
      final failed = statusChange(base, items, 'a', 'packing').copyWith(failed: true);
      final out = applyToOrders([base], [failed]).single;
      expect(out.itemStatusCounts, {'washing': 2});
      expect(out.pendingSync, isFalse);
    });

    test('oflayn yaratilgan buyurtma raqamsiz ko\'rinadi, server yaratgach yo\'qoladi', () {
      final newItems = [item('n-0', 1, 'pending')];
      final create = action('new1', {
        'kind': EffectKind.orderCreate,
        'order': {
          'id': 'new1',
          'serviceType': 'pickup',
          'customerName': 'Vali',
          'phone': '+998911112233',
          'location': 'Chilonzor',
          'status': 'new',
          'createdBy': 'emp1',
          'createdAt': DateTime(2026, 10, 5).millisecondsSinceEpoch,
        },
        'upserts': [itemToJson(newItems.first)],
        'summary': summarizeItems(newItems),
        'base': null,
      });

      final offline = applyToOrders([base], [create]);
      final synthetic = offline.firstWhere((o) => o.id == 'new1');
      expect(synthetic.awaitingNumber, isTrue);
      expect(synthetic.itemStatusCounts, {'pending': 1});
      expect(offline.first.id, 'new1', reason: 'eng yangisi yuqorida');

      // Server shu ID bilan yaratdi — ikkinchi nusxa paydo bo'lmasligi kerak.
      final real = orderFrom('new1', newItems, status: 'new');
      final online = applyToOrders([base, real], [create]);
      expect(online.where((o) => o.id == 'new1').length, 1);
      expect(online.firstWhere((o) => o.id == 'new1').orderNumber, 1245);
    });

    test('oflayn buyurtmaga keyingi amal ham qo\'llanadi, server yaratgach to\'xtaydi', () {
      final create = action('new1', {
        'kind': EffectKind.orderCreate,
        'order': {'id': 'new1', 'status': 'new', 'createdAt': 0},
        'summary': summarizeItems(const []),
      });
      final pickup = action('new1', {'kind': EffectKind.orderStatus, 'to': 'brought_in'});
      final out = applyToOrders(const [], [create, pickup]).single;
      expect(out.status, 'brought_in');
    });

    test('holat va jamoa mutlaq qo\'llanadi', () {
      final team = action('o1', {'kind': EffectKind.orderTeam, 'team': ['e1', 'e2'], 'status': 'team_assigned'});
      final out = applyToOrders([base], [team]).single;
      expect(out.assignedTeam, ['e1', 'e2']);
      expect(out.status, 'team_assigned');
    });
  });

  group('applyToItems', () {
    final items = [item('a', 1, 'washing'), item('b', 2, 'ready')];
    final base = orderFrom('o1', items);

    test('holat o\'zgarishi va yetkazish', () {
      final deliver = action('o1', {
        'kind': EffectKind.itemsChange,
        'upserts': [itemToJson(items[1].copyWith(status: 'done'))],
        'base': orderSignature(base),
      });
      final out = applyToItems('o1', items, [deliver]);
      expect(out.map((i) => i.status), ['washing', 'done']);
      expect(out[1].pendingSync, isTrue);
      expect(out[0].pendingSync, isFalse);
    });

    test('qo\'shilgan mahsulot server qaytargach ikkilanmaydi', () {
      final added = item('act-0', 3, 'pending');
      final add = action('o1', {'kind': EffectKind.itemsChange, 'upserts': [itemToJson(added)]});
      expect(applyToItems('o1', items, [add]).length, 3);
      // Server shu ID bilan yozdi.
      expect(applyToItems('o1', [...items, added], [add]).length, 3);
    });

    test('o\'chirish', () {
      final remove = action('o1', {'kind': EffectKind.itemsChange, 'removes': ['a']});
      expect(applyToItems('o1', items, [remove]).map((i) => i.id), ['b']);
    });

    test('boshqa buyurtmaning amali ta\'sir qilmaydi', () {
      final other = action('o2', {'kind': EffectKind.itemsChange, 'removes': ['a']});
      expect(applyToItems('o1', items, [other]), items);
    });
  });

  group('JSON', () {
    test('mahsulot saqlanib, aynan tiklanadi', () {
      final original = item('a', 1, 'packing', category: 'gilam').copyWith(qty: 4.5, condition: 'bad');
      final restored = itemFromJson(itemToJson(original));
      expect(itemToJson(restored), itemToJson(original));
    });

    test('amal saqlanib, aynan tiklanadi', () {
      final a = action('o1', {'kind': EffectKind.orderStatus, 'to': 'brought_in'}).copyWith(error: 'x', attempts: 3);
      final restored = PendingAction.fromJson(a.toJson())!;
      expect(restored.toJson(), a.toJson());
    });

    test('buzuq yozuv tashlab yuboriladi', () {
      expect(PendingAction.fromJson({'id': 1}), isNull);
      expect(PendingAction.fromJson('x'), isNull);
    });

    test('amal ID\'si server talabiga mos', () {
      final pattern = RegExp(r'^[A-Za-z0-9_-]{16,64}$');
      for (var i = 0; i < 200; i++) {
        expect(pattern.hasMatch(newActionId()), isTrue);
      }
      expect({for (var i = 0; i < 1000; i++) newActionId()}.length, 1000);
    });
  });
}

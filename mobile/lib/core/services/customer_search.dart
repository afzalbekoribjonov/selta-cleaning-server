import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../sync/action_queue.dart';
import '../sync/overlay.dart';
import 'auth_service.dart' show apiClientProvider;
import 'orders_repository.dart';

/// Mijozning qarzi, qisman to'lovlari va chegirmalari (server hisobi).
class CustomerFinance {
  final int debtCount;
  final num debtAmount;
  final int partialCount;
  final num partialAmount;
  final int discountCount;
  final num discountAmount;

  const CustomerFinance({
    required this.debtCount,
    required this.debtAmount,
    required this.partialCount,
    required this.partialAmount,
    required this.discountCount,
    required this.discountAmount,
  });

  factory CustomerFinance.fromJson(Map<String, dynamic> totals) {
    int i(String k) => (totals[k] as num?)?.toInt() ?? 0;
    num n(String k) => (totals[k] as num?) ?? 0;
    return CustomerFinance(
      debtCount: i('debtCount'),
      debtAmount: n('debtAmount'),
      partialCount: i('partialCount'),
      partialAmount: n('partialAmount'),
      discountCount: i('discountCount'),
      discountAmount: n('discountAmount'),
    );
  }

  bool get isClean => debtCount == 0 && partialCount == 0 && discountCount == 0;
}

/// Umumiy qidiruv natijasi — bitta mijoz va uning barcha buyurtmalari.
class CustomerResult {
  final String phone;
  final String customerName;

  /// Mijozning buyurtmalari — eng yangisi birinchi.
  final List<Order> orders;

  /// ID bo'yicha qidirilganda aynan topilgan buyurtma.
  final Order? focus;

  const CustomerResult({required this.phone, required this.customerName, required this.orders, this.focus});

  List<Order> get active => orders.where((o) => !o.isDone).toList();
  List<Order> get completed => orders.where((o) => o.isDone).toList();
  num get totalSpent => completed.fold<num>(0, (s, o) => s + o.totalPrice);
}

/// Butun bazadan qidirish (barcha bo'limlar uchun umumiy).
///
/// Buyurtmalar to'g'ridan-to'g'ri Firestore'dan — internet bo'lmasa
/// qurilma keshidan javob beradi. Navbatdagi (hali yuborilmagan)
/// o'zgarishlar ham qo'llanadi, shuning uchun oflayn yaratilgan buyurtma
/// ham topiladi.
class CustomerSearch {
  final Ref _ref;
  static const _maxOrders = 100;

  CustomerSearch(this._ref);

  CollectionReference<Map<String, dynamic>> get _orders => FirebaseFirestore.instance.collection('orders');

  List<Order> _withQueue(List<Order> base, bool Function(Order) keep) =>
      applyToOrders(base, _ref.read(actionQueueProvider)).where(keep).toList();

  Future<CustomerResult?> byPhone(String digits) async {
    final clean = digits.replaceAll(RegExp(r'\D'), '');
    if (clean.length < 9) return null;
    final last9 = clean.substring(clean.length - 9);
    final snap = await _orders.where('phone', whereIn: phoneVariants(clean)).limit(_maxOrders).get();
    final orders = _withQueue(
      snap.docs.map(Order.fromFirestore).toList(),
      (o) => o.phone.replaceAll(RegExp(r'\D'), '').endsWith(last9),
    );
    if (orders.isEmpty) return null;
    return CustomerResult(phone: orders.first.phone, customerName: orders.first.customerName, orders: orders);
  }

  Future<CustomerResult?> byNumber(int number) async {
    Order? found;
    // Avval ekrandagi ro'yxatdan — tez va internetsiz.
    for (final o in _ref.read(ordersProvider).valueOrNull ?? const <Order>[]) {
      if (o.orderNumber == number) found = o;
    }
    if (found == null) {
      final snap = await _orders.where('orderNumber', isEqualTo: number).limit(1).get();
      if (snap.docs.isEmpty) return null;
      found = _withQueue([Order.fromFirestore(snap.docs.first)], (_) => true).firstOrNull;
      if (found == null) return null;
    }

    // Shu buyurtma egasining qolgan buyurtmalari ham — mijoz kartasi uchun.
    final digits = found.phone.replaceAll(RegExp(r'\D'), '');
    final customer = digits.length >= 9 ? await byPhone(digits) : null;
    return CustomerResult(
      phone: found.phone,
      customerName: found.customerName,
      orders: customer?.orders ?? [found],
      focus: found,
    );
  }

  /// Faqat moliyaga ruxsati bor xodimlar uchun — server ham tekshiradi.
  Future<CustomerFinance> finance(String phone) async {
    final token = await _ref.read(idTokenProvider)();
    final res = await _ref.read(apiClientProvider).post('/customerFinance', idToken: token, body: {'phone': phone});
    return CustomerFinance.fromJson(Map<String, dynamic>.from(res['totals'] as Map));
  }
}

final customerSearchProvider = Provider<CustomerSearch>(CustomerSearch.new);

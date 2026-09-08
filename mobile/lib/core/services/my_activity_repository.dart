import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'auth_service.dart' show apiClientProvider, authStateProvider;

/// Birlik bo'yicha hajm — "145.6 m²" kabi, har biri alohida ko'rsatiladi.
class UnitAmount {
  final String unit;
  final String label;
  final num amount;
  const UnitAmount({required this.unit, required this.label, required this.amount});

  factory UnitAmount.fromMap(Map<Object?, Object?> m) => UnitAmount(
        unit: m['unit']?.toString() ?? '',
        label: m['label']?.toString() ?? '',
        amount: (m['amount'] as num?) ?? 0,
      );
}

/// Bitta bosqichdan o'tgan mahsulot (yuvildi / upakovka / yetkazildi).
class StageEntry {
  final String id;
  final DateTime? at;
  final String orderId;
  final int orderNumber;
  final String customerName;
  final String itemName;
  final int? itemNumber;
  final String unitLabel;
  final num unitAmount;
  final num price;

  const StageEntry({
    required this.id,
    required this.at,
    required this.orderId,
    required this.orderNumber,
    required this.customerName,
    required this.itemName,
    required this.itemNumber,
    required this.unitLabel,
    required this.unitAmount,
    required this.price,
  });

  factory StageEntry.fromMap(Map<Object?, Object?> m) => StageEntry(
        id: m['id']?.toString() ?? '',
        at: DateTime.tryParse(m['at']?.toString() ?? '')?.toLocal(),
        orderId: m['orderId']?.toString() ?? '',
        orderNumber: (m['orderNumber'] as num?)?.toInt() ?? 0,
        customerName: m['customerName']?.toString() ?? '',
        itemName: m['itemName']?.toString() ?? 'Mahsulot',
        itemNumber: (m['itemNumber'] as num?)?.toInt(),
        unitLabel: m['unitLabel']?.toString() ?? 'dona',
        unitAmount: (m['unitAmount'] as num?) ?? 0,
        price: (m['price'] as num?) ?? 0,
      );
}

/// Buyurtma darajasidagi ish (sexga olib keldi / buyurtma ochdi).
class OrderEntry {
  final String id;
  final DateTime? at;
  final int orderNumber;
  final String customerName;
  final String phone;
  final String location;
  final int itemCount;
  final num totalPrice;

  const OrderEntry({
    required this.id,
    required this.at,
    required this.orderNumber,
    required this.customerName,
    required this.phone,
    required this.location,
    required this.itemCount,
    required this.totalPrice,
  });

  factory OrderEntry.fromMap(Map<Object?, Object?> m) => OrderEntry(
        id: m['id']?.toString() ?? '',
        at: DateTime.tryParse(m['at']?.toString() ?? '')?.toLocal(),
        orderNumber: (m['orderNumber'] as num?)?.toInt() ?? 0,
        customerName: m['customerName']?.toString() ?? '',
        phone: m['phone']?.toString() ?? '',
        location: m['location']?.toString() ?? '',
        itemCount: (m['itemCount'] as num?)?.toInt() ?? 0,
        totalPrice: (m['totalPrice'] as num?) ?? 0,
      );
}

/// Bitta yetkazishdagi to'lov yozuvi.
class PaymentEntry {
  final String id;
  final DateTime? at;
  final String orderId;
  final int orderNumber;
  final String customerName;
  final String phone;
  final num dueAmount;
  final num paidAmount;
  final num shortfall;
  final String kind; // full | partial | debt | discount
  final bool settled;

  const PaymentEntry({
    required this.id,
    required this.at,
    required this.orderId,
    required this.orderNumber,
    required this.customerName,
    required this.phone,
    required this.dueAmount,
    required this.paidAmount,
    required this.shortfall,
    required this.kind,
    required this.settled,
  });

  factory PaymentEntry.fromMap(Map<Object?, Object?> m) => PaymentEntry(
        id: m['id']?.toString() ?? '',
        at: DateTime.tryParse(m['at']?.toString() ?? '')?.toLocal(),
        orderId: m['orderId']?.toString() ?? '',
        orderNumber: (m['orderNumber'] as num?)?.toInt() ?? 0,
        customerName: m['customerName']?.toString() ?? '',
        phone: m['phone']?.toString() ?? '',
        dueAmount: (m['dueAmount'] as num?) ?? 0,
        paidAmount: (m['paidAmount'] as num?) ?? 0,
        shortfall: (m['shortfall'] as num?) ?? 0,
        kind: m['kind']?.toString() ?? 'full',
        settled: m['settled'] == true,
      );
}

/// Son + summa juftligi (qarz/chegirma xulosasi).
class CountAmount {
  final int count;
  final num amount;
  const CountAmount(this.count, this.amount);

  factory CountAmount.fromMap(Map<Object?, Object?> m) =>
      CountAmount((m['count'] as num?)?.toInt() ?? 0, (m['amount'] as num?) ?? 0);
}

/// Xodimning BITTA KUNDAGI o'z ishi — server/routes/employeeActivity.ts
/// `myDailyActivity` javobining aynan shakli.
class MyDailyActivity {
  final String date;

  final int broughtInCount;
  final num broughtInTotal;
  final List<OrderEntry> broughtIn;

  final int deliveredCount;
  final int deliveredOrderCount;
  final num deliveredTotal;
  final List<StageEntry> delivered;

  final int washedCount;
  final List<UnitAmount> washedTotals;
  final List<StageEntry> washed;

  final int packedCount;
  final List<UnitAmount> packedTotals;
  final List<StageEntry> packed;

  final int createdCount;
  final num createdTotal;
  final List<OrderEntry> created;

  final num cash;
  final CountAmount debt;
  final CountAmount partial;
  final CountAmount discount;
  final List<PaymentEntry> payments;

  const MyDailyActivity({
    required this.date,
    required this.broughtInCount,
    required this.broughtInTotal,
    required this.broughtIn,
    required this.deliveredCount,
    required this.deliveredOrderCount,
    required this.deliveredTotal,
    required this.delivered,
    required this.washedCount,
    required this.washedTotals,
    required this.washed,
    required this.packedCount,
    required this.packedTotals,
    required this.packed,
    required this.createdCount,
    required this.createdTotal,
    required this.created,
    required this.cash,
    required this.debt,
    required this.partial,
    required this.discount,
    required this.payments,
  });

  static Map<Object?, Object?> _section(Map<String, dynamic> json, String key) {
    final value = json[key];
    return value is Map ? Map<Object?, Object?>.from(value) : const {};
  }

  static List<T> _list<T>(Object? raw, T Function(Map<Object?, Object?>) build) {
    if (raw is! List) return const [];
    return raw.map((e) => build(Map<Object?, Object?>.from(e as Map))).toList();
  }

  factory MyDailyActivity.fromJson(Map<String, dynamic> json) {
    final broughtIn = _section(json, 'broughtIn');
    final delivered = _section(json, 'delivered');
    final washed = _section(json, 'washed');
    final packed = _section(json, 'packed');
    final created = _section(json, 'created');
    final payments = _section(json, 'payments');

    return MyDailyActivity(
      date: json['date']?.toString() ?? '',
      broughtInCount: (broughtIn['count'] as num?)?.toInt() ?? 0,
      broughtInTotal: (broughtIn['totalPrice'] as num?) ?? 0,
      broughtIn: _list(broughtIn['orders'], OrderEntry.fromMap),
      deliveredCount: (delivered['count'] as num?)?.toInt() ?? 0,
      deliveredOrderCount: (delivered['orderCount'] as num?)?.toInt() ?? 0,
      deliveredTotal: (delivered['totalPrice'] as num?) ?? 0,
      delivered: _list(delivered['rows'], StageEntry.fromMap),
      washedCount: (washed['count'] as num?)?.toInt() ?? 0,
      washedTotals: _list(washed['totals'], UnitAmount.fromMap),
      washed: _list(washed['rows'], StageEntry.fromMap),
      packedCount: (packed['count'] as num?)?.toInt() ?? 0,
      packedTotals: _list(packed['totals'], UnitAmount.fromMap),
      packed: _list(packed['rows'], StageEntry.fromMap),
      createdCount: (created['count'] as num?)?.toInt() ?? 0,
      createdTotal: (created['totalPrice'] as num?) ?? 0,
      created: _list(created['orders'], OrderEntry.fromMap),
      cash: (payments['cash'] as num?) ?? 0,
      debt: CountAmount.fromMap(Map<Object?, Object?>.from((payments['debt'] as Map?) ?? const {})),
      partial: CountAmount.fromMap(Map<Object?, Object?>.from((payments['partial'] as Map?) ?? const {})),
      discount: CountAmount.fromMap(Map<Object?, Object?>.from((payments['discount'] as Map?) ?? const {})),
      payments: _list(payments['rows'], PaymentEntry.fromMap),
    );
  }
}

class MyActivityRepository {
  final ApiClient _api;
  MyActivityRepository(this._api);

  Future<MyDailyActivity> fetch({String? date}) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw StateError('Tizimga kirilmagan');
    final result = await _api.post(
      '/myDailyActivity',
      idToken: token,
      body: {if (date != null) 'date': date},
    );
    return MyDailyActivity.fromJson(result);
  }
}

final myActivityRepositoryProvider =
    Provider<MyActivityRepository>((ref) => MyActivityRepository(ref.watch(apiClientProvider)));

/// Bugungi shaxsiy faoliyat — profil sahifasi ochilganda bir marta
/// olinadi. Real-vaqtli oqim ATAYLAB emas: bu server hisobi, har bir
/// o'zgarishda qayta so'rashning ma'nosi yo'q. Sahifadan chiqilganda
/// bekor qilinadi, "Yangilash" bilan qayta so'raladi.
final myDailyActivityProvider = FutureProvider.autoDispose<MyDailyActivity>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(myActivityRepositoryProvider).fetch();
});

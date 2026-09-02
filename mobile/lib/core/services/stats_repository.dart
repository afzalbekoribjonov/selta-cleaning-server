import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart' show apiClientProvider, authStateProvider;
import 'api_client.dart';

/// Bitta ko'rsatkich ostidagi qator (buyurtma yoki mahsulot) — "Ko'rish"
/// tugmasi bosilganda shu ro'yxat ko'rsatiladi.
class StatEntry {
  final int orderNumber;
  final String customerName;
  final String? phone;
  final String? itemName;
  final num? amount;
  final num? qty;
  final String? calcType;

  const StatEntry({
    required this.orderNumber,
    required this.customerName,
    this.phone,
    this.itemName,
    this.amount,
    this.qty,
    this.calcType,
  });

  factory StatEntry.fromMap(Map<Object?, Object?> map) {
    return StatEntry(
      orderNumber: (map['orderNumber'] as num?)?.toInt() ?? 0,
      customerName: map['customerName']?.toString() ?? '',
      phone: map['phone']?.toString(),
      itemName: map['itemName']?.toString(),
      amount: map['amount'] as num?,
      qty: map['qty'] as num?,
      calcType: map['calcType']?.toString(),
    );
  }
}

/// O'lchov birligi bo'yicha jami (masalan "45.6 m²", "3 dona").
class UnitTotal {
  final String unit;
  final num amount;
  const UnitTotal(this.unit, this.amount);
}

class DailyStats {
  final String date;
  final int broughtInCount;
  final List<StatEntry> broughtIn;
  final List<UnitTotal> washedTotals;
  final int washedCount;
  final List<StatEntry> washed;
  final int deliveredCount;
  final List<StatEntry> delivered;
  final num cashTotal;
  final List<StatEntry> cashEntries;
  final int washingCount;
  final int washingOrderCount;
  final List<StatEntry> washing;
  final int readyCount;
  final int readyOrderCount;
  final List<StatEntry> ready;
  final int unmeasuredCount;
  final List<StatEntry> unmeasured;

  const DailyStats({
    required this.date,
    required this.broughtInCount,
    required this.broughtIn,
    required this.washedTotals,
    required this.washedCount,
    required this.washed,
    required this.deliveredCount,
    required this.delivered,
    required this.cashTotal,
    required this.cashEntries,
    required this.washingCount,
    required this.washingOrderCount,
    required this.washing,
    required this.readyCount,
    required this.readyOrderCount,
    required this.ready,
    required this.unmeasuredCount,
    required this.unmeasured,
  });

  static List<StatEntry> _entries(Object? raw) {
    if (raw is! List) return const [];
    return raw.map((e) => StatEntry.fromMap(Map<Object?, Object?>.from(e as Map))).toList();
  }

  static Map<Object?, Object?> _section(Map<String, dynamic> json, String key) {
    final value = json[key];
    return value is Map ? Map<Object?, Object?>.from(value) : const {};
  }

  factory DailyStats.fromJson(Map<String, dynamic> json) {
    final broughtIn = _section(json, 'broughtInToday');
    final washedToday = _section(json, 'washedToday');
    final delivered = _section(json, 'deliveredToday');
    final cash = _section(json, 'cashToHandOver');
    final washing = _section(json, 'washingNow');
    final ready = _section(json, 'readyToDeliver');
    final unmeasured = _section(json, 'unmeasured');

    final totalsRaw = washedToday['totals'];
    return DailyStats(
      date: json['date']?.toString() ?? '',
      broughtInCount: (broughtIn['count'] as num?)?.toInt() ?? 0,
      broughtIn: _entries(broughtIn['orders']),
      washedTotals: totalsRaw is List
          ? totalsRaw
              .map((e) => Map<Object?, Object?>.from(e as Map))
              .map((m) => UnitTotal(m['unit']?.toString() ?? '', (m['amount'] as num?) ?? 0))
              .toList()
          : const [],
      washedCount: (washedToday['count'] as num?)?.toInt() ?? 0,
      washed: _entries(washedToday['items']),
      deliveredCount: (delivered['count'] as num?)?.toInt() ?? 0,
      delivered: _entries(delivered['orders']),
      cashTotal: (cash['total'] as num?) ?? 0,
      cashEntries: _entries(cash['entries']),
      washingCount: (washing['count'] as num?)?.toInt() ?? 0,
      washingOrderCount: (washing['orderCount'] as num?)?.toInt() ?? 0,
      washing: _entries(washing['items']),
      readyCount: (ready['count'] as num?)?.toInt() ?? 0,
      readyOrderCount: (ready['orderCount'] as num?)?.toInt() ?? 0,
      ready: _entries(ready['items']),
      unmeasuredCount: (unmeasured['count'] as num?)?.toInt() ?? 0,
      unmeasured: _entries(unmeasured['orders']),
    );
  }
}

class StatsRepository {
  final ApiClient _api;
  StatsRepository(this._api);

  Future<DailyStats> fetchDailyStats() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw StateError('Tizimga kirilmagan');
    final result = await _api.post('/employeeDailyStats', idToken: token, body: const {});
    return DailyStats.fromJson(result);
  }
}

final statsRepositoryProvider = Provider<StatsRepository>((ref) => StatsRepository(ref.watch(apiClientProvider)));

/// Kunlik ko'rsatkichlar — ekran ochilganda bir marta olinadi, "Yangilash"
/// tugmasi bilan qayta so'raladi (real-vaqtli oqim emas: bu og'ir
/// hisoblash, har bir o'zgarishda qayta chaqirish shart emas).
final dailyStatsProvider = FutureProvider.autoDispose<DailyStats>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(statsRepositoryProvider).fetchDailyStats();
});

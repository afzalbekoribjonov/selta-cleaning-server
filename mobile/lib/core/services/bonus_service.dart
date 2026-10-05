import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/action_queue.dart' show idTokenProvider;
import 'auth_service.dart' show apiClientProvider;

/// Mijozning bonus (keshbek) hisobi — server: routes/bonus.ts.
class CustomerBonus {
  final num balance;
  final num earnedTotal;
  final num spentTotal;

  /// Joriy foiz (admin sozlamasi) — "har buyurtmadan 1%" deb ko'rsatish uchun.
  final num percent;

  const CustomerBonus({required this.balance, required this.earnedTotal, required this.spentTotal, required this.percent});

  factory CustomerBonus.fromJson(Map<String, dynamic> j) => CustomerBonus(
        balance: (j['balance'] as num?) ?? 0,
        earnedTotal: (j['earnedTotal'] as num?) ?? 0,
        spentTotal: (j['spentTotal'] as num?) ?? 0,
        percent: (j['percent'] as num?) ?? 0,
      );
}

/// Bonusni ishlatish va qaytarish — INTERNET BILAN, navbatsiz: server
/// hisobdagi qoldiqni shu zahoti tekshirishi kerak (oflayn ishlatilgan
/// bonus keyin yetmay qolsa, to'lov ham rad etilib ketardi).
class BonusService {
  final Ref _ref;
  BonusService(this._ref);

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final token = await _ref.read(idTokenProvider)();
    return _ref.read(apiClientProvider).post(path, idToken: token, body: body);
  }

  Future<CustomerBonus> fetch(String phone) async => CustomerBonus.fromJson(await _post('/customerBonus', {'phone': phone}));

  /// Qo'llangan summani qaytaradi. [amount] berilmasa — imkon qadar ko'p
  /// (hisobdagi bonus, lekin buyurtmaning to'lanmagan qismidan oshmaydi).
  Future<num> apply({required String orderId, num? amount, String? actorName}) async {
    final res = await _post('/applyBonus', {
      'orderId': orderId,
      if (amount != null) 'amount': amount,
      if (actorName != null) 'actorName': actorName,
    });
    return (res['applied'] as num?) ?? 0;
  }

  Future<void> cancel({required String orderId, required String entryId}) =>
      _post('/cancelBonus', {'orderId': orderId, 'entryId': entryId});
}

final bonusServiceProvider = Provider<BonusService>(BonusService.new);

/// Telefon raqami bo'yicha bonus hisobi. Internet bo'lmasa — xato
/// (chaqiruvchi "internet kerak" deb ko'rsatadi).
final customerBonusProvider = FutureProvider.autoDispose.family<CustomerBonus, String>(
  (ref, phone) => ref.read(bonusServiceProvider).fetch(phone),
);

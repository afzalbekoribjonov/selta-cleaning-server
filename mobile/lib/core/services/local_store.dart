import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Qurilmadagi kichik doimiy xotira — SharedPreferences ustidan yupqa qatlam.
///
/// `main()`da BIR MARTA ochiladi va [localStoreProvider] orqali uzatiladi,
/// shundan keyin hamma joyda SINXRON o'qiladi: ilova startida kutish yo'q.
///
/// Bu yerda faqat kichik, tez-tez o'qiladigan narsalar saqlanadi (xodim
/// identifikatsiyasi, amallar navbati). Buyurtmalar kabi katta ma'lumot —
/// Firestore'ning o'z keshida.
class LocalStore {
  final SharedPreferences _prefs;

  LocalStore(this._prefs);

  static Future<LocalStore> open() async => LocalStore(await SharedPreferences.getInstance());

  String? getString(String key) => _prefs.getString(key);

  Future<void> setString(String key, String value) => _prefs.setString(key, value);

  Future<void> remove(String key) => _prefs.remove(key);

  /// JSON obyekt — buzilgan yoki eski formatdagi yozuv `null` qaytaradi
  /// (xatolik otilmaydi: kesh har doim tashlab yuborilishi mumkin).
  Map<String, dynamic>? getJson(String key) {
    final raw = _prefs.getString(key);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> setJson(String key, Map<String, dynamic> value) => _prefs.setString(key, jsonEncode(value));
}

/// `main()`da haqiqiy nusxa bilan almashtiriladi (`overrideWithValue`).
final localStoreProvider = Provider<LocalStore>(
  (ref) => throw StateError('LocalStore main() da ochilmagan'),
);

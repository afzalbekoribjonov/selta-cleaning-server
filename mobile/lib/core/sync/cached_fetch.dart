import '../services/local_store.dart';

/// Server hisobotini so'raydi va oxirgi muvaffaqiyatli javobni qurilmada
/// saqlaydi.
///
/// Profildagi "Bugungi ish" va kunlik ko'rsatkichlar Firestore emas,
/// server hisobi — ular Firestore keshidan foydalana olmaydi. Busiz
/// internetsiz bu ekranlar faqat xato ko'rsatardi. Endi so'rov
/// muvaffaqiyatsiz bo'lsa, [usable] ruxsat bergan saqlangan nusxa
/// qaytariladi (masalan faqat BUGUN olingani — kechagi "bugungi ish"
/// noto'g'ri ma'lumot bo'lardi).
Future<Map<String, dynamic>> fetchWithCache(
  LocalStore store,
  String key,
  Future<Map<String, dynamic>> Function() fetch, {
  required bool Function(DateTime savedAt) usable,
}) async {
  try {
    final data = await fetch();
    await store.setJson(key, {'savedAt': DateTime.now().millisecondsSinceEpoch, 'data': data});
    return data;
  } catch (_) {
    final cached = store.getJson(key);
    final savedAt = cached?['savedAt'];
    final data = cached?['data'];
    if (savedAt is num && data is Map && usable(DateTime.fromMillisecondsSinceEpoch(savedAt.toInt()))) {
      return Map<String, dynamic>.from(data);
    }
    rethrow;
  }
}

/// Saqlangan nusxa shu kunniki bo'lsagina ishlatiladi.
bool savedToday(DateTime savedAt) {
  final now = DateTime.now();
  return savedAt.year == now.year && savedAt.month == now.month && savedAt.day == now.day;
}

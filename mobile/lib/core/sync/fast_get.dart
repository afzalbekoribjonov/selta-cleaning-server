import 'package:cloud_firestore/cloud_firestore.dart';

/// Bir martalik so'rov: avval server — QISQA kutish bilan, javob kelmasa
/// yoki internet yo'q bo'lsa qurilma keshi.
///
/// Oddiy `get()` sust internetda serverni uzoq (10+ soniya) kutadi va
/// ekran shu vaqt "yuklanmoqda"da qotib qoladi. Bu yerda esa kechikkan
/// server javobi o'rniga darhol keshdagi natija ko'rsatiladi (natijaning
/// `metadata.isFromCache` belgisi buni aytadi).
Future<QuerySnapshot<T>> getQueryFast<T>(Query<T> query, {Duration timeout = const Duration(seconds: 5)}) async {
  try {
    return await query.get(const GetOptions(source: Source.server)).timeout(timeout);
  } catch (_) {
    return query.get(const GetOptions(source: Source.cache));
  }
}

/// Hujjat uchun xuddi shunday. Keshda ham bo'lmasa — `null`.
Future<DocumentSnapshot<T>?> getDocFast<T>(DocumentReference<T> ref, {Duration timeout = const Duration(seconds: 5)}) async {
  try {
    return await ref.get(const GetOptions(source: Source.server)).timeout(timeout);
  } catch (_) {
    try {
      return await ref.get(const GetOptions(source: Source.cache));
    } catch (_) {
      return null;
    }
  }
}

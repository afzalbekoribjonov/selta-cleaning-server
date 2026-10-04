import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart';

/// Tizimga kirgan xodimning to'liq profili (ism, telefon, bo'lim,
/// ruxsatlar) — faqat o'ziniki yoki admin o'qiy oladi
/// (firestore.rules: employees/{id} read).
///
/// Oqim (snapshots), bir martalik o'qish emas:
///  - avval qurilma keshidagi nusxa DARHOL keladi — ekran serverni
///    kutmaydi, internetsiz ham ochiladi;
///  - admin ruxsatni o'zgartirsa (masalan "Omborxona" yoqilsa) u ilovada
///    qayta kirishsiz, darhol ko'rinadi.
/// Avval `.get()` edi: internet bor paytda u har safar server javobini
/// kutardi, ruxsat o'zgarishi esa faqat qayta kirgandan keyin sezilardi.
final currentEmployeeProvider = StreamProvider<Map<String, dynamic>?>((ref) async* {
  final claims = await ref.watch(employeeClaimsProvider.future);
  if (claims == null) {
    yield null;
    return;
  }

  yield* FirebaseFirestore.instance
      .collection('employees')
      .doc(claims.employeeId)
      .snapshots()
      .map((snap) => snap.data());
});

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart';

/// Tizimga kirgan xodimning to'liq profili (ism, telefon, bo'lim) — faqat
/// o'ziniki yoki admin o'qiy oladi (firestore.rules: employees/{id} read).
final currentEmployeeProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final claims = await ref.watch(employeeClaimsProvider.future);
  if (claims == null) return null;

  final snap = await FirebaseFirestore.instance.collection('employees').doc(claims.employeeId).get();
  return snap.data();
});

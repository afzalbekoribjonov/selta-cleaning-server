import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/product.dart';
import 'auth_service.dart' show authStateProvider;

/// Narx katalogi — admin_web'da boshqariladi, bu yerda faqat o'qiladi
/// (firestore.rules: `products` — isSignedIn() bo'lsa o'qish mumkin).
/// Buyurtmalar soni kabi bu ro'yxat ham kichik (odatda o'nlab mahsulot),
/// shuning uchun sahifalash shart emas.
final productsProvider = StreamProvider<List<Product>>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance
      .collection('products')
      .orderBy('name')
      .snapshots()
      .map((snap) => snap.docs.map(Product.fromFirestore).toList());
});

final conditionSurchargesProvider = StreamProvider<ConditionSurcharges>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance
      .collection('settings')
      .doc('conditionSurcharges')
      .snapshots()
      .map((doc) => ConditionSurcharges.fromMap(doc.data()));
});

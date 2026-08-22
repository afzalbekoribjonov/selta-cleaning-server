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

/// Buyurtma "Manba"si (talab: marketing statistikasi) — endi admin panel
/// orqali boshqariladi (avval qattiq kodlangan 5 ta variant edi). Sotuv
/// menejeri "Yangi buyurtma" formasida shu ro'yxatdan tanlaydi.
class OrderSource {
  final String id;
  final String name;
  final String color;
  const OrderSource({required this.id, required this.name, required this.color});
}

final orderSourcesProvider = StreamProvider<List<OrderSource>>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance.collection('orderSources').orderBy('name').snapshots().map(
        (snap) => snap.docs
            .map((d) => OrderSource(id: d.id, name: d.data()['name']?.toString() ?? '', color: d.data()['color']?.toString() ?? '#7A7482'))
            .toList(),
      );
});

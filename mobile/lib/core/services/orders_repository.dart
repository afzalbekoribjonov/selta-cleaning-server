import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import 'api_client.dart';
import 'auth_service.dart' show apiClientProvider;

/// Buyurtmalar bilan ishlash — o'qish to'g'ridan-to'g'ri Firestore orqali
/// (real-vaqtli, firestore.rules "isSignedIn() bo'lsa o'qish mumkin"ni
/// ruxsat beradi), yozish (yaratish/tahrirlash/status) esa server orqali
/// (imtiyozli mantiq — tranzaksiya, ruxsat tekshiruvi, audit log).
///
/// Hech qachon butun `orders` jamlanmasi bir yo'la yuklanmaydi (talab #9) —
/// `limit` bilan cheklangan, eng yangi buyurtmalar birinchi.
class OrdersRepository {
  final ApiClient _api;
  static const _pageSize = 60;

  OrdersRepository(this._api);

  Stream<List<Order>> watchRecentOrders() {
    return FirebaseFirestore.instance
        .collection('orders')
        .orderBy('createdAt', descending: true)
        .limit(_pageSize)
        .snapshots()
        .map((snap) => snap.docs.map(Order.fromFirestore).toList());
  }

  Future<String> _idToken() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw StateError('Tizimga kirilmagan');
    return token;
  }

  Future<({String orderId, int orderNumber})> createOrder({
    required String customerName,
    required String phone,
    required String location,
    required String serviceType,
    required String tariff,
    String? gpsCoords,
  }) async {
    final result = await _api.post(
      '/createOrder',
      idToken: await _idToken(),
      body: {
        'customerName': customerName,
        'phone': phone,
        'location': location,
        'serviceType': serviceType,
        'tariff': tariff,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
      },
    );
    return (orderId: result['orderId'] as String, orderNumber: (result['orderNumber'] as num).toInt());
  }

  Future<void> updateOrder({
    required String orderId,
    required String customerName,
    required String phone,
    required String location,
    required String tariff,
    String? gpsCoords,
  }) async {
    await _api.post(
      '/updateOrder',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'customerName': customerName,
        'phone': phone,
        'location': location,
        'tariff': tariff,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
      },
    );
  }

  Future<void> changeOrderStatus({required String orderId, required String toStatus, String? note}) async {
    await _api.post(
      '/changeOrderStatus',
      idToken: await _idToken(),
      body: {'orderId': orderId, 'toStatus': toStatus, if (note != null) 'note': note},
    );
  }

  /// Izoh — to'g'ridan-to'g'ri Firestore'ga yoziladi (firestore.rules past
  /// xavfli yozuv sifatida ruxsat beradi, server round-trip shart emas).
  /// `authorName` faqat ko'rsatish uchun (rules faqat authorId'ni tekshiradi).
  Future<void> addComment({
    required String orderId,
    required String employeeId,
    required String authorName,
    required String text,
  }) {
    return FirebaseFirestore.instance.collection('orders').doc(orderId).collection('comments').add({
      'authorId': employeeId,
      'authorName': authorName,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<List<Map<String, dynamic>>> watchComments(String orderId) {
    return FirebaseFirestore.instance
        .collection('orders')
        .doc(orderId)
        .collection('comments')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => {'id': d.id, ...d.data()}).toList());
  }

  Stream<List<Map<String, dynamic>>> watchStatusHistory(String orderId) {
    return FirebaseFirestore.instance
        .collection('orders')
        .doc(orderId)
        .collection('statusHistory')
        .orderBy('changedAt', descending: false)
        .snapshots()
        .map((snap) => snap.docs.map((d) => d.data()).toList());
  }
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) => OrdersRepository(ref.watch(apiClientProvider)));

final recentOrdersProvider = StreamProvider<List<Order>>((ref) {
  return ref.watch(ordersRepositoryProvider).watchRecentOrders();
});

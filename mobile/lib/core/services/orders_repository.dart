import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../models/order_item.dart';
import 'api_client.dart';
import 'auth_service.dart' show apiClientProvider, authStateProvider;

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

  /// Joyida-yuvish jamoasiga biriktirilgan buyurtmalar (talab #14) — har
  /// qanday bo'lim xodimi o'ziga biriktirilgan ishlarni ko'rishi mumkin.
  Stream<List<Order>> watchMyTeamOrders(String employeeId) {
    return FirebaseFirestore.instance
        .collection('orders')
        .where('assignedTeam', arrayContains: employeeId)
        .snapshots()
        .map((snap) => snap.docs.map(Order.fromFirestore).where((o) => !o.isDone).toList());
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

  Future<void> changeOrderStatus({
    required String orderId,
    required String toStatus,
    String? note,
    num? collectedAmount,
  }) async {
    await _api.post(
      '/changeOrderStatus',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'toStatus': toStatus,
        if (note != null) 'note': note,
        if (collectedAmount != null) 'collectedAmount': collectedAmount,
      },
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

  /// Faqat izoh muallifi o'zgartira oladi (firestore.rules bilan
  /// tasdiqlanadi) — matn va `editedAt` dan boshqa maydon o'zgarmaydi.
  Future<void> editComment({
    required String orderId,
    required String commentId,
    required String text,
  }) {
    return FirebaseFirestore.instance
        .collection('orders')
        .doc(orderId)
        .collection('comments')
        .doc(commentId)
        .update({'text': text, 'editedAt': FieldValue.serverTimestamp()});
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

  Stream<List<OrderItem>> watchItems(String orderId) {
    return FirebaseFirestore.instance
        .collection('orders')
        .doc(orderId)
        .collection('items')
        .orderBy('itemNumber')
        .snapshots()
        .map((snap) => snap.docs.map(OrderItem.fromFirestore).toList());
  }

  /// Ishchi mahsulotlarni belgilaydi — tartib raqamlari serverda avtomatik
  /// beriladi (talab #3/#6).
  Future<void> addOrderItems({
    required String orderId,
    required List<({String name, num area, num price})> items,
  }) async {
    await _api.post(
      '/addOrderItems',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'items': items.map((e) => {'name': e.name, 'area': e.area, 'price': e.price}).toList(),
      },
    );
  }

  Future<void> submitItemQc({
    required String orderId,
    required String itemId,
    required String qcStatus,
    String? qcNote,
  }) async {
    await _api.post(
      '/submitItemQc',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'itemId': itemId,
        'qcStatus': qcStatus,
        if (qcNote != null) 'qcNote': qcNote,
      },
    );
  }

  /// Sifat nazorati butun buyurtmaga umumiy baho (1-5) qo'yadi — har bir
  /// mahsulotning pass/fail holatidan tashqari, upakovka/umumiy sifatni
  /// baholash uchun.
  Future<void> submitOrderQcRating({
    required String orderId,
    required int rating,
    String? note,
  }) async {
    await _api.post(
      '/submitOrderQcRating',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'rating': rating,
        if (note != null) 'note': note,
      },
    );
  }

  /// Dispetcher/Sifat nazorati joyida-yuvish buyurtmasiga jamoa biriktiradi
  /// (talab #14).
  Future<void> assignTeam({required String orderId, required List<String> employeeIds}) async {
    await _api.post(
      '/assignTeam',
      idToken: await _idToken(),
      body: {'orderId': orderId, 'employeeIds': employeeIds},
    );
  }
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) => OrdersRepository(ref.watch(apiClientProvider)));

/// `authStateProvider`ni kuzatadi — sof texnik sabab: bu Firestore
/// `.snapshots()` oqimi auth holatidan mustaqil bo'lsa, chiqish (signOut)
/// paytida oqim `permission-denied` bilan butunlay to'xtaydi (Firestore
/// buni qaytadan urinib ko'rmaydi) va Riverpod shu xato holatini abadiy
/// keshlab qoladi — keyingi PIN bilan kirishlarda ham xuddi shu xatoni
/// ko'rsataveradi. Auth holatiga bog'lash oqimni har safar kirish/chiqishda
/// yangidan yaratadi.
final recentOrdersProvider = StreamProvider<List<Order>>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchRecentOrders();
});

final myTeamOrdersProvider = StreamProvider.family<List<Order>, String>((ref, employeeId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchMyTeamOrders(employeeId);
});

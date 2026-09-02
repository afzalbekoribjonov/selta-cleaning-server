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

  /// Buyurtmaning YAKUNLANMAGAN (faol) holatlari — `done`dan boshqa
  /// hammasi. Item-darajasiga ko'chirilishidan oldingi eski buyurtmalarda
  /// order darajasida qolgan holatlar ham kiritilgan. `pending`/`returned`
  /// ATAYLAB yo'q — ular faqat ITEM holatlari. Ro'yxat 10 tadan oshmasligi
  /// ham muhim: Firestore'ning eski `in` chegarasi aynan shuncha edi.
  static const kActiveOrderStatuses = [
    'new',
    'picked_up',
    'brought_in',
    'washing',
    'packing',
    'qc_review',
    'ready',
    'team_assigned',
    'in_progress',
  ];

  static const _activeLimit = 400;

  /// FAOL buyurtmalar — HOLAT bo'yicha so'raladi, "oxirgi N ta" oynasi
  /// bilan cheklanmaydi.
  ///
  /// Avval barcha ekranlar `watchRecentOrders`dan (oxirgi 60 ta) olib,
  /// keyin `status != 'done'` bo'yicha filtrlardi — bu jiddiy xato edi:
  /// yakunlangan buyurtmalar oynani to'ldirgach, eski (lekin hamon FAOL)
  /// buyurtmalar xodimlarga umuman ko'rinmay qolardi. (status, createdAt)
  /// composite indeksi firebase/firestore.indexes.json'da mavjud.
  Stream<List<Order>> watchActiveOrders() {
    return FirebaseFirestore.instance
        .collection('orders')
        .where('status', whereIn: kActiveOrderStatuses)
        .orderBy('createdAt', descending: true)
        .limit(_activeLimit)
        .snapshots()
        .map((snap) => snap.docs.map(Order.fromFirestore).toList());
  }

  /// Oxirgi N ta buyurtma — YAKUNLANGANLARI bilan birga (bugungi
  /// statistika va qidiruvda yetkazilganlarni ham topish uchun).
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

  /// `tariff` faqat "onsite" uchun (pickup'da har bir item o'z tarifini
  /// `items` ro'yxati orqali olib keladi — talab #3: inline mahsulot
  /// qo'shish, har biri o'z tarifi bilan).
  Future<({String orderId, int orderNumber})> createOrder({
    required String customerName,
    required String phone,
    required String location,
    required String serviceType,
    String? tariff,
    String? gpsCoords,
    List<CatalogItemDraft>? items,
    List<String>? notedItems,
    num? estimatedPrice,
    String? source,
    bool? walkIn,
    String? actorName,
  }) async {
    final result = await _api.post(
      '/createOrder',
      idToken: await _idToken(),
      body: {
        'customerName': customerName,
        'phone': phone,
        'location': location,
        'serviceType': serviceType,
        if (tariff != null) 'tariff': tariff,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
        if (items != null && items.isNotEmpty) 'items': items.map((e) => e.toJson()).toList(),
        if (notedItems != null && notedItems.isNotEmpty) 'notedItems': notedItems,
        if (estimatedPrice != null) 'estimatedPrice': estimatedPrice,
        if (source != null) 'source': source,
        if (walkIn != null) 'walkIn': walkIn,
        if (actorName != null) 'actorName': actorName,
      },
    );
    return (orderId: result['orderId'] as String, orderNumber: (result['orderNumber'] as num).toInt());
  }

  Future<void> updateOrder({
    required String orderId,
    required String customerName,
    required String phone,
    required String location,
    String? tariff,
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
        if (tariff != null) 'tariff': tariff,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
      },
    );
  }

  Future<void> changeOrderStatus({
    required String orderId,
    required String toStatus,
    String? note,
    num? collectedAmount,
    String? gpsCoords,
    String? actorName,
  }) async {
    await _api.post(
      '/changeOrderStatus',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'toStatus': toStatus,
        if (note != null) 'note': note,
        if (collectedAmount != null) 'collectedAmount': collectedAmount,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
        if (actorName != null) 'actorName': actorName,
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

  /// Dastavchik yoki ishchi mahsulot(lar) qo'shadi — tartib raqamlari va
  /// narx serverda avtomatik hisoblanadi (talab #2/#3/#6).
  Future<void> addOrderItems({
    required String orderId,
    required List<CatalogItemDraft> items,
  }) async {
    await _api.post(
      '/addOrderItems',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'items': items.map((e) => e.toJson()).toList(),
      },
    );
  }

  Future<void> updateOrderItem({
    required String orderId,
    required String itemId,
    required CatalogItemDraft item,
  }) async {
    await _api.post(
      '/updateOrderItem',
      idToken: await _idToken(),
      body: {'orderId': orderId, 'itemId': itemId, 'item': item.toJson()},
    );
  }

  Future<void> deleteOrderItem({required String orderId, required String itemId}) async {
    await _api.post(
      '/deleteOrderItem',
      idToken: await _idToken(),
      body: {'orderId': orderId, 'itemId': itemId},
    );
  }

  /// Pickup buyurtma itemining holatini o'zgartiradi (pending -> washing ->
  /// packing -> ready/returned -> ... -> done) — talab: har bir mahsulot
  /// mustaqil pipeline'ga ega, "packing"da istalgan ishchi ✅/❌ bosa oladi.
  Future<void> changeItemStatus({
    required String orderId,
    required String itemId,
    required String toStatus,
    String? qcNote,
    num? collectedAmount,
    String? actorName,
  }) async {
    await _api.post(
      '/changeItemStatus',
      idToken: await _idToken(),
      body: {
        'orderId': orderId,
        'itemId': itemId,
        'toStatus': toStatus,
        if (qcNote != null) 'qcNote': qcNote,
        if (collectedAmount != null) 'collectedAmount': collectedAmount,
        if (actorName != null) 'actorName': actorName,
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
final _activeOrdersStreamProvider = StreamProvider<List<Order>>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchActiveOrders();
});

final _recentOrdersStreamProvider = StreamProvider<List<Order>>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchRecentOrders();
});

/// Ekranlar ishlatadigan yagona buyurtmalar manbai: FAOL buyurtmalar
/// (to'liq, holat bo'yicha) + oxirgi 60 ta (yakunlanganlari bilan).
/// Ikkinchisi qidiruvda yetkazilgan buyurtmalar topilishi va "bugun
/// yetgazildi" kabi ko'rsatkichlar to'g'ri chiqishi uchun kerak.
///
/// Yuklanish/xato holati FAOL oqimdan olinadi — shunda faol ro'yxat
/// kelishi bilan ekran ko'rsatilaveradi, yakunlanganlar oynasini kutib
/// turmaydi.
final ordersProvider = Provider<AsyncValue<List<Order>>>((ref) {
  final active = ref.watch(_activeOrdersStreamProvider);
  final recent = ref.watch(_recentOrdersStreamProvider);
  return active.whenData((activeOrders) {
    final byId = <String, Order>{};
    for (final o in activeOrders) {
      byId[o.id] = o;
    }
    for (final o in recent.valueOrNull ?? const <Order>[]) {
      byId.putIfAbsent(o.id, () => o);
    }
    final merged = byId.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return merged;
  });
});

final myTeamOrdersProvider = StreamProvider.family<List<Order>, String>((ref, employeeId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchMyTeamOrders(employeeId);
});

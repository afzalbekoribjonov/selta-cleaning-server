import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants.dart';
import '../models/order.dart';
import '../models/order_item.dart';
import '../sync/action_queue.dart';
import '../sync/overlay.dart';
import '../sync/pending_action.dart';
import '../utils/money_utils.dart';
import 'auth_service.dart' show authStateProvider, employeeClaimsProvider;
import 'order_items_provider.dart';
import 'tariff_settings.dart';

/// Buyurtmalar bilan ishlash.
///
/// O'QISH — to'g'ridan-to'g'ri Firestore (real-vaqtli; firestore.rules
/// "isSignedIn() bo'lsa o'qish mumkin"). Qurilma keshi cheksiz, shuning
/// uchun ro'yxatlar internetsiz ham ochiladi.
///
/// YOZISH — oflayn navbat orqali (core/sync/action_queue.dart). Har bir
/// usul amalni navbatga qo'yadi va DARHOL qaytadi; ekran o'zgarishni shu
/// zahoti ko'rsatadi, server esa fonda (internet bo'lganda) bajaradi.
/// Imzolar avvalgidek qoldirilgan — chaqiruvchi ekranlar o'zgarmagan.
///
/// Hech qachon butun `orders` jamlanmasi bir yo'la yuklanmaydi (talab #9) —
/// `limit` bilan cheklangan, eng yangi buyurtmalar birinchi.
class OrdersRepository {
  final Ref _ref;
  static const _pageSize = 60;

  OrdersRepository(this._ref);

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

  // ---------------------------------------------------------------- O'QISH

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

  Stream<List<OrderItem>> watchItems(String orderId) {
    return FirebaseFirestore.instance
        .collection('orders')
        .doc(orderId)
        .collection('items')
        .orderBy('itemNumber')
        .snapshots()
        .map((snap) => snap.docs.map(OrderItem.fromFirestore).toList());
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

  /// Ilova keshida (faol + oxirgi buyurtmalar) topilmagan buyurtmani
  /// TO'G'RIDAN-TO'G'RI Firestore'dan qidiradi.
  ///
  /// Telefon bo'yicha qidiruv FAQAT raqam to'liq kiritilganda ishlaydi
  /// (kamida 9 raqam) — yarim kiritilgan raqamga so'rov yuborishning
  /// ma'nosi yo'q. "+998" shart emas: bazadagi turli yozilish shakllari
  /// birdaniga tekshiriladi.
  Future<List<Order>> searchOrders(String term) async {
    final trimmed = term.trim();
    if (trimmed.isEmpty) return const [];

    final orders = FirebaseFirestore.instance.collection('orders');
    final queries = <Query<Map<String, dynamic>>>[];

    final asNumber = int.tryParse(trimmed.replaceFirst('#', ''));
    if (asNumber != null && asNumber > 0) {
      queries.add(orders.where('orderNumber', isEqualTo: asNumber).limit(5));
    }

    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 9) {
      queries.add(orders.where('phone', whereIn: phoneVariants(digits)).limit(25));
    }

    if (queries.isEmpty) return const [];

    final results = <String, Order>{};
    for (final query in queries) {
      try {
        final snap = await query.get();
        for (final doc in snap.docs) {
          results[doc.id] = Order.fromFirestore(doc);
        }
      } catch (_) {
        // Bitta so'rov muvaffaqiyatsiz bo'lsa (masalan indeks yo'q),
        // qolganlari baribir natija berishi mumkin.
      }
    }

    return results.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  // ---------------------------------------------------------------- YOZISH

  ActionQueue get _queue => _ref.read(actionQueueProvider.notifier);

  String get _employeeId => _ref.read(employeeClaimsProvider).valueOrNull?.employeeId ?? '';

  /// Ekrandagi (navbat qo'llangan) buyurtma.
  Order? _order(String orderId) => _find(_ref.read(ordersProvider).valueOrNull, orderId);

  /// Serverdagi holat — "ikki marta qo'llanmaslik" barmoq izi uchun.
  Order? _baseOrder(String orderId) => _find(_ref.read(baseOrdersProvider).valueOrNull, orderId);

  /// Ekrandagi mahsulotlar. Mahsulot amallari tafsilot oynasidan
  /// bajariladi va o'sha oyna shu providerni kuzatib turadi — shuning
  /// uchun qiymat odatda tayyor. Yuklanmagan bo'lsa buyurtma xulosasi
  /// bashorat qilinmaydi (server natijasi kelguncha eski sanoq turadi).
  List<OrderItem>? _items(String orderId) => _ref.read(orderItemsProvider(orderId)).valueOrNull;

  static Order? _find(List<Order>? orders, String id) {
    if (orders == null) return null;
    for (final o in orders) {
      if (o.id == id) return o;
    }
    return null;
  }

  String _label(String orderId, String text) {
    final order = _order(orderId);
    if (order == null) return text;
    final ref = order.awaitingNumber ? 'Yangi buyurtma' : '#${order.orderNumber}';
    return '$ref · $text';
  }

  String _enqueue({
    required String path,
    required Map<String, dynamic> body,
    required String? orderId,
    required Map<String, dynamic> effect,
    required String label,
    String? id,
  }) {
    final actionId = id ?? newActionId();
    _queue.enqueue(
      PendingAction(
        id: actionId,
        path: path,
        body: {...body, 'actionId': actionId},
        orderId: orderId,
        effect: effect,
        label: label,
        createdAt: DateTime.now(),
      ),
    );
    return actionId;
  }

  /// Mahsulot o'zgarishining ekrandagi ta'siri: o'zgargan mahsulotlar +
  /// shu holatdan server hisoblaydigan buyurtma xulosasi.
  Map<String, dynamic> _itemsEffect(
    String orderId, {
    required List<OrderItem>? after,
    List<OrderItem> upserts = const [],
    List<String> removes = const [],
    String? orderStatus,
  }) {
    final base = _baseOrder(orderId);
    return {
      'kind': EffectKind.itemsChange,
      if (upserts.isNotEmpty) 'upserts': [for (final i in upserts) itemToJson(i)],
      if (removes.isNotEmpty) 'removes': removes,
      if (after != null) 'summary': summarizeItems(after),
      'base': base == null ? null : orderSignature(base),
      if (orderStatus != null) 'orderStatus': orderStatus,
    };
  }

  TariffConfig get _tariffs => _ref.read(tariffSettingsProvider).valueOrNull ?? kDefaultTariffs;

  /// Navbatga qo'shilayotgan mahsulotning ekrandagi ko'rinishi. Narx —
  /// katalog oynasidagi hisob (server keyin aniq narxni o'zi hisoblaydi).
  OrderItem _draftToItem(
    CatalogItemDraft d, {
    required String id,
    required int number,
    required bool pickup,
    required DateTime now,
  }) {
    final days = d.tariff == null ? null : (_tariffs[d.tariff] ?? _tariffs['standart'])?.days;
    return OrderItem(
      id: id,
      itemNumber: number,
      name: d.name,
      area: d.calcType == 'sqm' ? (d.qty ?? 0) : 0,
      price: d.estimatedPrice ?? d.price ?? 0,
      qcStatus: 'pending',
      calcType: d.calcType,
      productId: d.productId,
      category: d.category,
      width: d.width,
      height: d.height,
      qty: d.qty,
      sizeVariant: d.sizeVariant,
      condition: d.condition,
      tariff: d.tariff,
      status: pickup ? 'pending' : null,
      dueDate: pickup && days != null ? now.add(Duration(days: days)) : null,
      createdAt: now,
    );
  }

  /// `tariff` faqat "onsite" uchun (pickup'da har bir item o'z tarifini
  /// `items` ro'yxati orqali olib keladi — talab #3: inline mahsulot
  /// qo'shish, har biri o'z tarifi bilan).
  ///
  /// Buyurtma navbatga darhol yoziladi va ekranda "Raqam kutilmoqda" bilan
  /// ko'rinadi. Internet bo'lsa server raqami bir necha soniya kutiladi —
  /// sotuv menejeri mijozga raqamni darhol aytishi uchun; kelmasa `0`
  /// qaytadi va raqam ulanish tiklanganda o'zi paydo bo'ladi. Buyurtma
  /// serverda AYNAN SHU ID bilan yaratiladi, shuning uchun unga oflayn
  /// qilingan keyingi amallar ham to'g'ri bog'lanadi.
  ///
  /// [gpsChecked] — forma mijozni o'zi tekshirib GPS haqida qaror qilgan:
  /// [gpsCoords] `null` bo'lsa ham yuboriladi va server mijozning eski
  /// GPS'ini ko'chirmaydi (masalan manzil o'zgargan).
  Future<({String orderId, int orderNumber})> createOrder({
    required String customerName,
    required String phone,
    required String location,
    required String serviceType,
    String? tariff,
    String? gpsCoords,
    bool gpsChecked = false,
    List<CatalogItemDraft>? items,
    List<String>? notedItems,
    num? estimatedPrice,
    String? source,
    bool? walkIn,
    String? actorName,
  }) async {
    final orderId = newActionId();
    final now = DateTime.now();
    final employeeId = _employeeId;
    final isPickup = serviceType == 'pickup';
    final isWalkIn = isPickup && walkIn == true;
    final drafts = isPickup ? (items ?? const <CatalogItemDraft>[]) : const <CatalogItemDraft>[];

    final createdItems = [
      for (var i = 0; i < drafts.length; i++)
        _draftToItem(drafts[i], id: '$orderId-$i', number: i + 1, pickup: true, now: now),
    ];
    final onsiteDays = tariff == null ? null : (_tariffs[tariff] ?? _tariffs['standart'])?.days;

    _enqueue(
      id: orderId,
      path: '/createOrder',
      orderId: orderId,
      label: 'Yangi buyurtma · $customerName',
      body: {
        'orderId': orderId,
        'customerName': customerName,
        'phone': phone,
        'location': location,
        'serviceType': serviceType,
        if (tariff != null) 'tariff': tariff,
        if (gpsCoords != null || gpsChecked) 'gpsCoords': gpsCoords,
        if (drafts.isNotEmpty) 'items': drafts.map((e) => e.toJson()).toList(),
        if (notedItems != null && notedItems.isNotEmpty) 'notedItems': notedItems,
        if (estimatedPrice != null) 'estimatedPrice': estimatedPrice,
        if (source != null) 'source': source,
        if (walkIn != null) 'walkIn': walkIn,
        if (actorName != null) 'actorName': actorName,
      },
      effect: {
        'kind': EffectKind.orderCreate,
        'order': {
          'id': orderId,
          'serviceType': serviceType,
          'customerName': customerName,
          'phone': phone,
          'location': location,
          if (gpsCoords != null) 'gpsCoords': gpsCoords,
          if (!isPickup) 'tariff': tariff,
          'status': isWalkIn ? 'brought_in' : 'new',
          'createdBy': employeeId,
          'createdAt': now.millisecondsSinceEpoch,
          if (!isPickup && onsiteDays != null) 'dueDate': now.add(Duration(days: onsiteDays)).millisecondsSinceEpoch,
          if (notedItems != null) 'notedItems': notedItems,
          if (estimatedPrice != null) 'estimatedPrice': estimatedPrice,
          if (source != null) 'source': source,
          if (isWalkIn) 'intakeMethod': 'walk_in',
          if (isWalkIn) 'pickedUpBy': employeeId,
          if (isWalkIn) 'pickedUpAt': now.millisecondsSinceEpoch,
        },
        if (createdItems.isNotEmpty) 'upserts': [for (final i in createdItems) itemToJson(i)],
        'summary': summarizeItems(createdItems),
        'base': null,
      },
    );

    final result = await _queue.resultOf(orderId, const Duration(seconds: 6));
    return (orderId: orderId, orderNumber: (result?['orderNumber'] as num?)?.toInt() ?? 0);
  }

  /// [newOrderFields] — faqat "Yangi" holatdagi buyurtmada ma'noli (server
  /// boshqa holatda e'tiborsiz qoldiradi). Berilsa manba `null` bo'lsa ham
  /// yuboriladi: bu manbani olib tashlash degani.
  Future<void> updateOrder({
    required String orderId,
    required String customerName,
    required String phone,
    required String location,
    String? tariff,
    String? gpsCoords,
    ({String? source, List<String>? notedItems, num? estimatedPrice})? newOrderFields,
  }) async {
    final extra = newOrderFields;
    _enqueue(
      path: '/updateOrder',
      orderId: orderId,
      label: _label(orderId, "Ma'lumotlar tahrirlandi"),
      body: {
        'orderId': orderId,
        'customerName': customerName,
        'phone': phone,
        'location': location,
        if (tariff != null) 'tariff': tariff,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
        if (extra != null) 'source': extra.source,
        if (extra?.notedItems != null) 'notedItems': extra!.notedItems,
        if (extra != null && extra.notedItems != null) 'estimatedPrice': extra.estimatedPrice,
      },
      effect: {
        'kind': EffectKind.orderUpdate,
        'fields': {
          'customerName': customerName,
          'phone': phone,
          'location': location,
          if (tariff != null) 'tariff': tariff,
          if (gpsCoords != null) 'gpsCoords': gpsCoords,
          if (extra?.source != null) 'source': extra!.source,
          if (extra?.notedItems != null) 'notedItems': extra!.notedItems,
          if (extra?.estimatedPrice != null) 'estimatedPrice': extra!.estimatedPrice,
        },
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
    final pickedUp = toStatus == 'brought_in';
    _enqueue(
      path: '/changeOrderStatus',
      orderId: orderId,
      label: _label(orderId, statusOf(toStatus).label),
      body: {
        'orderId': orderId,
        'toStatus': toStatus,
        if (note != null) 'note': note,
        if (collectedAmount != null) 'collectedAmount': collectedAmount,
        if (gpsCoords != null) 'gpsCoords': gpsCoords,
        if (actorName != null) 'actorName': actorName,
      },
      effect: {
        'kind': EffectKind.orderStatus,
        'to': toStatus,
        if (pickedUp) 'pickedUpBy': _employeeId,
        if (pickedUp) 'pickedUpAt': DateTime.now().millisecondsSinceEpoch,
      },
    );
  }

  /// Buyurtmaning tayyor mahsulotlarini BIR HARAKATDA topshiradi va
  /// to'lovni qayd etadi (server: routes/payments.ts).
  ///
  /// Summa majburiy. U mahsulotlar narxidan kam bo'lsa, `kind` bilan
  /// sababi ko'rsatiladi: 'partial' | 'debt' | 'discount'.
  Future<void> deliverOrderItems({
    required String orderId,
    required List<String> itemIds,
    required num paidAmount,
    required num cashAmount,
    required num cardAmount,
    String? kind,
    String? note,
    String? actorName,
  }) async {
    final items = _items(orderId);
    final ids = itemIds.toSet();
    final now = DateTime.now();
    final employeeId = _employeeId;
    OrderItem deliver(OrderItem i) => i.copyWith(status: 'done', deliveredBy: employeeId, deliveredAt: now);

    final after = items == null ? null : [for (final i in items) ids.contains(i.id) ? deliver(i) : i];
    final remaining = after?.where((i) => !i.isDone).length;

    _enqueue(
      path: '/deliverOrderItems',
      orderId: orderId,
      label: _label(orderId, '${itemIds.length} ta mahsulot topshirildi · ${formatMoneyUz(paidAmount)}'),
      body: {
        'orderId': orderId,
        'itemIds': itemIds,
        'paidAmount': paidAmount,
        'cashAmount': cashAmount,
        'cardAmount': cardAmount,
        if (kind != null) 'kind': kind,
        if (note != null) 'note': note,
        if (actorName != null) 'actorName': actorName,
      },
      effect: _itemsEffect(
        orderId,
        after: after,
        upserts: [for (final i in items ?? const <OrderItem>[]) if (ids.contains(i.id)) deliver(i)],
        orderStatus: remaining == 0 ? 'done' : null,
      ),
    );
  }

  /// Qarz yoki qisman to'lovni yopadi — mijoz qolgan pulni bergach.
  ///
  /// Naqd/karta ulushi ham yoziladi: yopilgan pul o'sha kuni xodim
  /// qo'liga tushadi va kunlik kassa hisobida ko'rinishi kerak.
  Future<void> settlePayment({
    required String paymentId,
    num? amount,
    num? cashAmount,
    num? cardAmount,
  }) async {
    _enqueue(
      path: '/settlePayment',
      orderId: null,
      label: 'Qolgan pul yopildi${amount != null ? ' · ${formatMoneyUz(amount)}' : ''}',
      body: {
        'paymentId': paymentId,
        if (amount != null) 'amount': amount,
        if (cashAmount != null) 'cashAmount': cashAmount,
        if (cardAmount != null) 'cardAmount': cardAmount,
      },
      effect: {'kind': EffectKind.paymentSettle, 'paymentId': paymentId},
    );
  }

  /// Izoh — to'g'ridan-to'g'ri Firestore'ga yoziladi (firestore.rules past
  /// xavfli yozuv sifatida ruxsat beradi, server round-trip shart emas).
  /// `authorName` faqat ko'rsatish uchun (rules faqat authorId'ni tekshiradi).
  ///
  /// Natija KUTILMAYDI: Firestore yozuvni qurilma keshiga darhol qo'yadi
  /// (ro'yxatda shu zahoti ko'rinadi) va internet bo'lganda o'zi yuboradi.
  /// Avval `await` edi — internetsiz u hech qachon tugamas va izoh
  /// maydoni abadiy "yuborilmoqda" holatida qotib qolardi.
  Future<void> addComment({
    required String orderId,
    required String employeeId,
    required String authorName,
    required String text,
  }) async {
    // ID oldindan olinadi — kartadagi "oxirgi izoh" aynan shu izohga bog'lanadi.
    final ref = FirebaseFirestore.instance.collection('orders').doc(orderId).collection('comments').doc();
    ref.set({
      'authorId': employeeId,
      'authorName': authorName,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    }).ignore();
    _setLastComment(orderId: orderId, commentId: ref.id, text: text, authorName: authorName, at: DateTime.now());
  }

  /// [createdAt] — izoh yozilgan payt. Server faqat shu izoh kartadagi
  /// oxirgisi bo'lsa yangilaydi (eski izohni tahrirlash yangisini bosmaydi).
  Future<void> editComment({
    required String orderId,
    required String commentId,
    required String text,
    String? authorName,
    DateTime? createdAt,
  }) async {
    FirebaseFirestore.instance
        .collection('orders')
        .doc(orderId)
        .collection('comments')
        .doc(commentId)
        .update({'text': text, 'editedAt': FieldValue.serverTimestamp()}).ignore();
    _setLastComment(orderId: orderId, commentId: commentId, text: text, authorName: authorName ?? '', at: createdAt, edit: true);
  }

  /// Kartadagi oxirgi izohni navbat orqali yangilaydi (routes/comments.ts).
  /// Ekranda darhol ko'rinadi; tahrirda esa faqat bu izoh hozir kartada
  /// turgan bo'lsa.
  void _setLastComment({
    required String orderId,
    required String commentId,
    required String text,
    required String authorName,
    DateTime? at,
    bool edit = false,
  }) {
    final order = _order(orderId);
    final isShown = !edit || order?.lastCommentAt == null || (at != null && !at.isBefore(order!.lastCommentAt!));
    _enqueue(
      path: '/setLastComment',
      orderId: orderId,
      label: _label(orderId, edit ? 'Izoh tahrirlandi' : "Izoh qo'shildi"),
      body: {
        'orderId': orderId,
        'commentId': commentId,
        'text': text,
        'authorName': authorName,
        if (at != null) 'at': at.millisecondsSinceEpoch,
      },
      effect: isShown
          ? {
              'kind': EffectKind.orderUpdate,
              'fields': {
                'lastCommentText': text,
                if (authorName.isNotEmpty) 'lastCommentAuthor': authorName,
                if (at != null) 'lastCommentAt': at.millisecondsSinceEpoch,
              },
            }
          : const {'kind': 'none'},
    );
  }

  Future<void> addOrderItems({
    required String orderId,
    required List<CatalogItemDraft> items,
  }) async {
    final actionId = newActionId();
    final order = _order(orderId);
    final current = _items(orderId);
    final now = DateTime.now();
    final isPickup = order?.serviceType != 'onsite';
    final startNumber = (current?.length ?? 0) + 1;

    // ID'lar server bilan BIR XIL: server ham mahsulotni `actionId-index`
    // bilan yozadi, shuning uchun u kelgach ekranda dublikat paydo bo'lmaydi.
    final added = [
      for (var i = 0; i < items.length; i++)
        _draftToItem(items[i], id: '$actionId-$i', number: startNumber + i, pickup: isPickup, now: now),
    ];

    _enqueue(
      id: actionId,
      path: '/addOrderItems',
      orderId: orderId,
      label: _label(orderId, "${items.length} ta mahsulot qo'shildi"),
      body: {'orderId': orderId, 'items': items.map((e) => e.toJson()).toList()},
      effect: _itemsEffect(orderId, after: current == null ? null : [...current, ...added], upserts: added),
    );
  }

  Future<void> updateOrderItem({
    required String orderId,
    required String itemId,
    required CatalogItemDraft item,
  }) async {
    final current = _items(orderId);
    OrderItem? existing;
    for (final i in current ?? const <OrderItem>[]) {
      if (i.id == itemId) existing = i;
    }
    final changed = existing?.copyWith(
      name: item.name,
      price: item.estimatedPrice ?? item.price,
      calcType: item.calcType,
      productId: item.productId,
      category: item.category,
      width: item.width,
      height: item.height,
      qty: item.qty,
      area: item.calcType == 'sqm' ? item.qty : null,
      sizeVariant: item.sizeVariant,
      condition: item.condition,
      tariff: item.tariff,
    );

    _enqueue(
      path: '/updateOrderItem',
      orderId: orderId,
      label: _label(orderId, '${item.name} — tahrirlandi'),
      body: {'orderId': orderId, 'itemId': itemId, 'item': item.toJson()},
      effect: _itemsEffect(
        orderId,
        after: current == null || changed == null ? null : [for (final i in current) i.id == itemId ? changed : i],
        upserts: [if (changed != null) changed],
      ),
    );
  }

  Future<void> deleteOrderItem({required String orderId, required String itemId}) async {
    final current = _items(orderId);
    String name = 'Mahsulot';
    for (final i in current ?? const <OrderItem>[]) {
      if (i.id == itemId) name = i.name;
    }
    _enqueue(
      path: '/deleteOrderItem',
      orderId: orderId,
      label: _label(orderId, "$name — o'chirildi"),
      body: {'orderId': orderId, 'itemId': itemId},
      effect: _itemsEffect(
        orderId,
        after: current?.where((i) => i.id != itemId).toList(),
        removes: [itemId],
      ),
    );
  }

  Future<void> changeItemStatus({
    required String orderId,
    required String itemId,
    required String toStatus,
    String? qcNote,
    num? collectedAmount,
    String? actorName,
  }) async {
    final current = _items(orderId);
    OrderItem? existing;
    for (final i in current ?? const <OrderItem>[]) {
      if (i.id == itemId) existing = i;
    }
    // Server qoidasi bilan bir xil (routes/orders.ts changeItemStatus):
    // "tayyor" — sifat nazoratidan o'tdi, "qaytarildi" — o'tmadi.
    final changed = existing?.copyWith(
      status: toStatus,
      qcStatus: toStatus == 'ready'
          ? 'passed'
          : toStatus == 'returned'
              ? 'failed'
              : null,
      qcNote: toStatus == 'returned' ? qcNote : null,
      deliveredBy: toStatus == 'done' ? _employeeId : null,
      deliveredAt: toStatus == 'done' ? DateTime.now() : null,
      collectedAmount: toStatus == 'done' ? collectedAmount : null,
    );

    _enqueue(
      path: '/changeItemStatus',
      orderId: orderId,
      label: _label(orderId, '${existing?.name ?? 'Mahsulot'} — ${statusOf(toStatus).label}'),
      body: {
        'orderId': orderId,
        'itemId': itemId,
        'toStatus': toStatus,
        if (qcNote != null) 'qcNote': qcNote,
        if (collectedAmount != null) 'collectedAmount': collectedAmount,
        if (actorName != null) 'actorName': actorName,
      },
      effect: _itemsEffect(
        orderId,
        after: current == null || changed == null ? null : [for (final i in current) i.id == itemId ? changed : i],
        upserts: [if (changed != null) changed],
      ),
    );
  }

  Future<void> submitOrderQcRating({
    required String orderId,
    required int rating,
    String? note,
  }) async {
    _enqueue(
      path: '/submitOrderQcRating',
      orderId: orderId,
      label: _label(orderId, 'Sifat bahosi: $rating'),
      body: {'orderId': orderId, 'rating': rating, if (note != null) 'note': note},
      effect: const {'kind': 'none'},
    );
  }

  Future<void> assignTeam({required String orderId, required List<String> employeeIds}) async {
    final order = _order(orderId);
    _enqueue(
      path: '/assignTeam',
      orderId: orderId,
      label: _label(orderId, 'Jamoa biriktirildi'),
      body: {'orderId': orderId, 'employeeIds': employeeIds},
      effect: {
        'kind': EffectKind.orderTeam,
        'team': employeeIds,
        // Server ham "Yangi" buyurtmani shu holatga o'tkazadi.
        if (order?.status == 'new') 'status': 'team_assigned',
      },
    );
  }
}

/// Telefon raqamining bazada uchrashi mumkin bo'lgan barcha yozilishlari —
/// Firestore'ning `whereIn` so'rovi uchun (10 tadan oshmaydi).
List<String> phoneVariants(String digits) {
  final last9 = digits.length >= 9 ? digits.substring(digits.length - 9) : digits;
  return <String>{digits, last9, '+998$last9', '998$last9'}.toList();
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) => OrdersRepository(ref));

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

/// SERVERDAGI buyurtmalar — FAOL buyurtmalar (to'liq, holat bo'yicha) +
/// oxirgi 60 ta (yakunlanganlari bilan). Ikkinchisi qidiruvda yetkazilgan
/// buyurtmalar topilishi va "bugun yetgazildi" kabi ko'rsatkichlar
/// to'g'ri chiqishi uchun kerak.
///
/// Yuklanish/xato holati FAOL oqimdan olinadi — shunda faol ro'yxat
/// kelishi bilan ekran ko'rsatilaveradi, yakunlanganlar oynasini kutib
/// turmaydi.
final baseOrdersProvider = Provider<AsyncValue<List<Order>>>((ref) {
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
    return byId.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });
});

/// Ekranlar ishlatadigan yagona buyurtmalar manbai — serverdagi
/// ma'lumot + navbatdagi (hali yuborilmagan) amallarning ta'siri.
final ordersProvider = Provider<AsyncValue<List<Order>>>((ref) {
  final base = ref.watch(baseOrdersProvider);
  final actions = ref.watch(actionQueueProvider);
  return base.whenData((orders) => applyToOrders(orders, actions));
});

final _myTeamOrdersBaseProvider = StreamProvider.family<List<Order>, String>((ref, employeeId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchMyTeamOrders(employeeId);
});

/// Xodim biriktirilgan joyida-yuvish ishlari — navbat qo'llangan holda
/// (jamoa ishini "boshlandi"/"tugadi" qilish oflayn ham darhol ko'rinadi).
final myTeamOrdersProvider = Provider.family<AsyncValue<List<Order>>, String>((ref, employeeId) {
  final base = ref.watch(_myTeamOrdersBaseProvider(employeeId));
  final actions = ref.watch(actionQueueProvider);
  return base.whenData((orders) => applyToOrders(orders, actions).where((o) => !o.isDone).toList());
});

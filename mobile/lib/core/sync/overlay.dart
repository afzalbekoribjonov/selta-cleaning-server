import '../models/order.dart';
import '../models/order_item.dart';
import 'pending_action.dart';

/// Navbatdagi amallarni server ma'lumoti USTIGA qo'yib ko'rsatish.
///
/// Ilova serverga yozishni kutmaydi: amal navbatga tushgan zahoti ekran
/// shu yerdagi qoidalar bo'yicha o'zgaradi. Server amalni qabul qilib,
/// Firestore yangilangach esa navbatdagi yozuv o'chadi va ekran
/// serverning haqiqiy ma'lumotiga qaytadi — ikkalasi bir xil bo'lishi
/// uchun hosila maydonlar server bilan AYNAN bir qoidada hisoblanadi
/// ([summarizeItems] = server/src/lib/orderSummary.ts).
///
/// IKKI MARTA QO'LLANMASLIK qoidasi: buyurtmaning hosila maydonlari
/// (holat sanog'i, summa...) amal yozilgan paytdagi server holati
/// ([orderSignature]) o'zgarmagan bo'lsagina almashtiriladi. Server
/// amalni bajarib bo'lgach bu holat o'zgaradi va bizning bashoratimiz
/// avtomatik ravishda o'chadi — serverning o'z natijasi ustiga yana
/// qo'shilib, sonlar ikki barobar bo'lib ketmaydi.

abstract final class EffectKind {
  /// Oflayn yaratilgan buyurtma (va uning mahsulotlari).
  static const orderCreate = 'order.create';

  /// Mijoz ma'lumotlari va boshqa oddiy maydonlar.
  static const orderUpdate = 'order.update';

  /// Buyurtma holati (olib kelindi, jamoa ishi boshlandi...).
  static const orderStatus = 'order.status';

  /// Mahsulotlardagi har qanday o'zgarish: holat, yetkazish, qo'shish,
  /// tahrirlash, o'chirish. Yagona tur — hammasi "qaysi mahsulot qanday
  /// bo'ldi + buyurtma xulosasi qanday bo'ldi" deb ifodalanadi.
  static const itemsChange = 'items.change';

  static const orderTeam = 'order.team';

  /// Qarzni yopish — buyurtmaga emas, profil ro'yxatiga ta'sir qiladi.
  static const paymentSettle = 'payment.settle';
}

const _noCategory = '_none';

/// Server summarisi bilan bir xil hosila maydonlar (orderSummary.ts).
Map<String, dynamic> summarizeItems(List<OrderItem> items) {
  final tariffs = <String>{};
  final statusCounts = <String, int>{};
  final stageCategories = <String, Set<String>>{};
  DateTime? earliest;
  var zeroPrice = 0;
  num total = 0;

  for (final item in items) {
    final status = item.status;
    if (status != null) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      stageCategories.putIfAbsent(status, () => <String>{}).add(item.category ?? _noCategory);
    }
    if (item.tariff != null) tariffs.add(item.tariff!);
    total += item.price;

    if (status != 'done') {
      final due = item.dueDate;
      if (due != null && (earliest == null || due.isBefore(earliest))) earliest = due;
      if (!(item.price > 0)) zeroPrice += 1;
    }
  }

  return {
    'itemStatusCounts': statusCounts,
    'itemStageCategories': {for (final e in stageCategories.entries) e.key: e.value.toList()},
    'itemTariffs': tariffs.toList(),
    'earliestPendingDueDate': earliest?.millisecondsSinceEpoch,
    'zeroPriceItemCount': zeroPrice,
    'totalPrice': total,
  };
}

/// Buyurtma xulosasining "barmoq izi" — server uni o'zgartirganini bilish uchun.
String orderSignature(Order o) {
  final counts = o.itemStatusCounts.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
  return '${o.totalPrice}|${o.zeroPriceItemCount}|${counts.map((e) => '${e.key}:${e.value}').join(',')}';
}

Order _withSummary(Order o, Map<String, dynamic>? summary) {
  if (summary == null) return o;
  final due = summary['earliestPendingDueDate'];
  return o.copyWith(
    itemStatusCounts: Map<String, int>.from(
      (summary['itemStatusCounts'] as Map).map((k, v) => MapEntry(k.toString(), (v as num).toInt())),
    ),
    itemStageCategories: (summary['itemStageCategories'] as Map).map(
      (k, v) => MapEntry(k.toString(), (v as List).map((e) => e.toString()).toList()),
    ),
    itemTariffs: (summary['itemTariffs'] as List).map((e) => e.toString()).toList(),
    earliestPendingDueDate: due is num ? DateTime.fromMillisecondsSinceEpoch(due.toInt()) : null,
    zeroPriceItemCount: (summary['zeroPriceItemCount'] as num).toInt(),
    totalPrice: summary['totalPrice'] as num,
  );
}

Order _syntheticOrder(Map<String, dynamic> j) {
  DateTime? ms(Object? v) => v is num ? DateTime.fromMillisecondsSinceEpoch(v.toInt()) : null;
  return Order(
    id: j['id'] as String,
    orderNumber: 0,
    customerName: j['customerName']?.toString() ?? '',
    phone: j['phone']?.toString() ?? '',
    location: j['location']?.toString() ?? '',
    gpsCoords: j['gpsCoords'] as String?,
    serviceType: j['serviceType']?.toString() ?? 'pickup',
    tariff: j['tariff'] as String?,
    status: j['status']?.toString() ?? 'new',
    createdBy: j['createdBy']?.toString() ?? '',
    createdAt: ms(j['createdAt']) ?? DateTime.now(),
    dueDate: ms(j['dueDate']),
    pickedUpBy: j['pickedUpBy'] as String?,
    pickedUpAt: ms(j['pickedUpAt']),
    notedItems: (j['notedItems'] as List?)?.map((e) => e.toString()).toList() ?? const [],
    estimatedPrice: j['estimatedPrice'] as num?,
    source: j['source'] as String?,
    intakeMethod: j['intakeMethod'] as String?,
    pendingSync: true,
  );
}

/// Buyurtmalar ro'yxatiga navbatdagi amallarni qo'llaydi.
///
/// Rad etilgan ([PendingAction.failed]) amal qo'llanmaydi: o'zgarish
/// aslida sodir bo'lmagan va ekran haqiqatni ko'rsatishi kerak.
List<Order> applyToOrders(List<Order> base, List<PendingAction> actions) {
  final live = actions.where((a) => !a.failed && a.orderId != null).toList();
  if (live.isEmpty) return base;

  final byId = <String, Order>{for (final o in base) o.id: o};
  final baseSignatures = <String, String>{for (final o in base) o.id: orderSignature(o)};
  final changed = <String>{};

  for (final a in live) {
    final id = a.orderId!;
    final e = a.effect;
    switch (a.kind) {
      case EffectKind.orderCreate:
        // Server buyurtmani XUDDI SHU ID bilan yaratadi — u kelgach
        // bashorat o'z-o'zidan keraksiz bo'ladi.
        if (byId.containsKey(id)) continue;
        byId[id] = _withSummary(_syntheticOrder(Map<String, dynamic>.from(e['order'] as Map)), _summaryOf(e));
      case EffectKind.orderUpdate:
        final o = byId[id];
        if (o == null) continue;
        final f = Map<String, dynamic>.from(e['fields'] as Map);
        byId[id] = o.copyWith(
          customerName: f['customerName'] as String?,
          phone: f['phone'] as String?,
          location: f['location'] as String?,
          gpsCoords: f['gpsCoords'] as String?,
          tariff: f['tariff'] as String?,
          source: f['source'] as String?,
          notedItems: (f['notedItems'] as List?)?.map((x) => x.toString()).toList(),
          estimatedPrice: f['estimatedPrice'] as num?,
        );
      case EffectKind.orderStatus:
        final o = byId[id];
        if (o == null) continue;
        final at = e['pickedUpAt'];
        byId[id] = o.copyWith(
          status: e['to'] as String?,
          pickedUpBy: e['pickedUpBy'] as String?,
          pickedUpAt: at is num ? DateTime.fromMillisecondsSinceEpoch(at.toInt()) : null,
        );
      case EffectKind.itemsChange:
        final o = byId[id];
        if (o == null) continue;
        // Hosila maydonlar faqat server hali bu amalni qo'llamagan
        // bo'lsa — aks holda u ikkinchi marta qo'shilardi.
        final stillPending = baseSignatures[id] == e['base'];
        var next = stillPending ? _withSummary(o, _summaryOf(e)) : o;
        final status = e['orderStatus'] as String?;
        if (status != null) next = next.copyWith(status: status);
        byId[id] = next;
      case EffectKind.orderTeam:
        final o = byId[id];
        if (o == null) continue;
        byId[id] = o.copyWith(
          assignedTeam: (e['team'] as List).map((x) => x.toString()).toList(),
          status: e['status'] as String?,
        );
      default:
        continue;
    }
    changed.add(id);
  }

  final result = [
    for (final o in byId.values) changed.contains(o.id) ? o.copyWith(pendingSync: true) : o,
  ]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return result;
}

Map<String, dynamic>? _summaryOf(Map<String, dynamic> effect) {
  final s = effect['summary'];
  return s is Map ? Map<String, dynamic>.from(s) : null;
}

/// Bitta buyurtmaning mahsulotlariga navbatdagi amallarni qo'llaydi.
///
/// Mahsulot darajasidagi o'zgarishlar MUTLAQ (masalan "holati = upakovka"),
/// shuning uchun server natijasi kelib bo'lgan bo'lsa ham qayta qo'llash
/// zararsiz — ikki marta qo'shilmaydi.
List<OrderItem> applyToItems(String orderId, List<OrderItem> base, List<PendingAction> actions) {
  final relevant = actions.where(
    (a) => !a.failed && a.orderId == orderId && (a.kind == EffectKind.itemsChange || a.kind == EffectKind.orderCreate),
  );
  if (relevant.isEmpty) return base;

  final items = [...base];
  for (final a in relevant) {
    final removes = (a.effect['removes'] as List?)?.map((e) => e.toString()).toSet() ?? const <String>{};
    if (removes.isNotEmpty) items.removeWhere((i) => removes.contains(i.id));

    for (final raw in (a.effect['upserts'] as List?) ?? const []) {
      final item = itemFromJson(Map<String, dynamic>.from(raw as Map)).copyWith(pendingSync: true);
      final index = items.indexWhere((i) => i.id == item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.add(item);
      }
    }
  }
  items.sort((a, b) => a.itemNumber.compareTo(b.itemNumber));
  return items;
}

/// Navbatda saqlash uchun — faqat ekranda ko'rsatish uchun kerakli maydonlar.
Map<String, dynamic> itemToJson(OrderItem i) => {
      'id': i.id,
      'itemNumber': i.itemNumber,
      'name': i.name,
      'area': i.area,
      'price': i.price,
      'qcStatus': i.qcStatus,
      'calcType': i.calcType,
      if (i.productId != null) 'productId': i.productId,
      if (i.category != null) 'category': i.category,
      if (i.width != null) 'width': i.width,
      if (i.height != null) 'height': i.height,
      if (i.qty != null) 'qty': i.qty,
      if (i.sizeVariant != null) 'sizeVariant': i.sizeVariant,
      if (i.condition != null) 'condition': i.condition,
      if (i.tariff != null) 'tariff': i.tariff,
      if (i.status != null) 'status': i.status,
      if (i.dueDate != null) 'dueDate': i.dueDate!.millisecondsSinceEpoch,
      if (i.createdAt != null) 'createdAt': i.createdAt!.millisecondsSinceEpoch,
      if (i.deliveredBy != null) 'deliveredBy': i.deliveredBy,
      if (i.deliveredAt != null) 'deliveredAt': i.deliveredAt!.millisecondsSinceEpoch,
      if (i.collectedAmount != null) 'collectedAmount': i.collectedAmount,
    };

OrderItem itemFromJson(Map<String, dynamic> j) {
  DateTime? ms(Object? v) => v is num ? DateTime.fromMillisecondsSinceEpoch(v.toInt()) : null;
  return OrderItem(
    id: j['id'] as String,
    itemNumber: (j['itemNumber'] as num?)?.toInt() ?? 0,
    name: j['name']?.toString() ?? 'Mahsulot',
    area: (j['area'] as num?) ?? 0,
    price: (j['price'] as num?) ?? 0,
    qcStatus: j['qcStatus']?.toString() ?? 'pending',
    calcType: j['calcType']?.toString() ?? 'fixed',
    productId: j['productId'] as String?,
    category: j['category'] as String?,
    width: j['width'] as num?,
    height: j['height'] as num?,
    qty: j['qty'] as num?,
    sizeVariant: j['sizeVariant'] as String?,
    condition: j['condition'] as String?,
    tariff: j['tariff'] as String?,
    status: j['status'] as String?,
    dueDate: ms(j['dueDate']),
    createdAt: ms(j['createdAt']),
    deliveredBy: j['deliveredBy'] as String?,
    deliveredAt: ms(j['deliveredAt']),
    collectedAmount: j['collectedAmount'] as num?,
  );
}

import 'package:cloud_firestore/cloud_firestore.dart';

/// Buyurtmadagi bitta jismoniy mahsulot (masalan bitta gilam). `itemNumber`
/// buyurtma raqami bilan birga "1/3" kabi sub-ID hosil qiladi (talab #3/#6).
///
/// `status`, `tariff`, `dueDate` — faqat "Olib kelish" (pickup) buyurtma
/// itemlarida mavjud (ITEM_PIPELINE: pending -> washing -> packing ->
/// ready -> done, "packing"dan "returned"ga va undan "washing"ga qaytish
/// bilan). Joyida yuvish (onsite) itemlarida bular null — order-level
/// holat ishlatiladi.
class OrderItem {
  final String id;
  final int itemNumber;
  final String name;
  final num area;
  final num price;
  final String qcStatus; // 'pending' | 'passed' | 'failed'
  final String? qcNote;
  final String? productId;
  final String calcType; // 'sqm' | 'meter' | 'kg' | 'count' | 'size' | 'fixed'
  final String? category; // 'gilam' | 'parda' | 'boshqa' — ishchi mutaxassisligi filtri uchun
  final num? width;
  final num? height;
  final num? qty;
  final String? sizeVariant; // 'small' | 'large'
  final num? unitPrice;
  final String? condition; // 'average' | 'bad' | 'veryBad'
  final num? conditionSurchargePercent;
  final String? tariff;
  final DateTime? dueDate;
  final DateTime? createdAt;
  final String? status; // 'pending' | 'washing' | 'packing' | 'ready' | 'returned' | 'done'
  final String? addedByDepartment;
  final String? washedBy;
  final DateTime? washedAt;
  final String? deliveredBy;
  final DateTime? deliveredAt;
  // Faqat ko'rsatish uchun (server: changeItemStatus) — haqiqiy
  // hisobdorlik har doim `deliveredBy` (employeeId)dan.
  final String? deliveredByName;
  final num? collectedAmount;

  const OrderItem({
    required this.id,
    required this.itemNumber,
    required this.name,
    required this.area,
    required this.price,
    required this.qcStatus,
    this.qcNote,
    this.productId,
    this.calcType = 'fixed',
    this.category,
    this.width,
    this.height,
    this.qty,
    this.sizeVariant,
    this.unitPrice,
    this.condition,
    this.conditionSurchargePercent,
    this.tariff,
    this.dueDate,
    this.createdAt,
    this.status,
    this.addedByDepartment,
    this.washedBy,
    this.washedAt,
    this.deliveredBy,
    this.deliveredAt,
    this.deliveredByName,
    this.collectedAmount,
  });

  factory OrderItem.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return OrderItem(
      id: doc.id,
      itemNumber: (data['itemNumber'] as num?)?.toInt() ?? 0,
      name: data['name']?.toString() ?? 'Mahsulot',
      area: (data['area'] as num?) ?? 0,
      price: (data['price'] as num?) ?? 0,
      qcStatus: data['qcStatus']?.toString() ?? 'pending',
      qcNote: data['qcNote']?.toString(),
      productId: data['productId']?.toString(),
      calcType: data['calcType']?.toString() ?? 'fixed',
      category: data['category']?.toString(),
      width: data['width'] as num?,
      height: data['height'] as num?,
      qty: data['qty'] as num?,
      sizeVariant: data['sizeVariant']?.toString(),
      unitPrice: data['unitPrice'] as num?,
      condition: data['condition']?.toString(),
      conditionSurchargePercent: data['conditionSurchargePercent'] as num?,
      tariff: data['tariff']?.toString(),
      dueDate: (data['dueDate'] as Timestamp?)?.toDate(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      status: data['status']?.toString(),
      addedByDepartment: data['addedByDepartment']?.toString(),
      washedBy: data['washedBy']?.toString(),
      washedAt: (data['washedAt'] as Timestamp?)?.toDate(),
      deliveredBy: data['deliveredBy']?.toString(),
      deliveredAt: (data['deliveredAt'] as Timestamp?)?.toDate(),
      deliveredByName: data['deliveredByName']?.toString(),
      collectedAmount: data['collectedAmount'] as num?,
    );
  }

  String subId(int orderNumber) => '$orderNumber/$itemNumber';

  bool get isDone => status == 'done';

  bool get isOverdue {
    if (dueDate == null || isDone) return false;
    return DateTime.now().isAfter(dueDate!);
  }
}

/// Buyurtmaga mahsulot qo'shish/tahrirlashda serverga yuboriladigan
/// ma'lumot — katalogdan tanlangan (calcType!='fixed') yoki qo'lda
/// kiritilgan (calcType=='fixed') bo'lishi mumkin. Narxni server katalog +
/// holat ustama foizidan hisoblaydi (fixed'dan tashqari). `tariff` —
/// pickup buyurtmalarida MAJBURIY (har bir item o'z tarifini tanlaydi).
class CatalogItemDraft {
  final String name;
  final String? productId;
  final String calcType;
  final String? tariff;
  final num? width;
  final num? height;
  final num? qty;
  final String? sizeVariant;
  final String? condition;
  final num? price;

  const CatalogItemDraft({
    required this.name,
    this.productId,
    required this.calcType,
    this.tariff,
    this.width,
    this.height,
    this.qty,
    this.sizeVariant,
    this.condition,
    this.price,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        if (productId != null) 'productId': productId,
        'calcType': calcType,
        if (tariff != null) 'tariff': tariff,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (qty != null) 'qty': qty,
        if (sizeVariant != null) 'sizeVariant': sizeVariant,
        if (condition != null) 'condition': condition,
        if (price != null) 'price': price,
      };
}

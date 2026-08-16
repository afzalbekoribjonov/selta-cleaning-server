import 'package:cloud_firestore/cloud_firestore.dart';

/// Buyurtmadagi bitta jismoniy mahsulot (masalan bitta gilam). `itemNumber`
/// buyurtma raqami bilan birga "1/3" kabi sub-ID hosil qiladi (talab #3/#6).
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
  final num? width;
  final num? height;
  final num? qty;
  final String? sizeVariant; // 'small' | 'large'
  final num? unitPrice;
  final String? condition; // 'average' | 'bad' | 'veryBad'
  final num? conditionSurchargePercent;

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
    this.width,
    this.height,
    this.qty,
    this.sizeVariant,
    this.unitPrice,
    this.condition,
    this.conditionSurchargePercent,
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
      width: data['width'] as num?,
      height: data['height'] as num?,
      qty: data['qty'] as num?,
      sizeVariant: data['sizeVariant']?.toString(),
      unitPrice: data['unitPrice'] as num?,
      condition: data['condition']?.toString(),
      conditionSurchargePercent: data['conditionSurchargePercent'] as num?,
    );
  }

  String subId(int orderNumber) => '$orderNumber/$itemNumber';
}

/// Buyurtmaga mahsulot qo'shish/tahrirlashda serverga yuboriladigan
/// ma'lumot — katalogdan tanlangan (calcType!='fixed') yoki qo'lda
/// kiritilgan (calcType=='fixed') bo'lishi mumkin. Narxni server katalog +
/// holat ustama foizidan hisoblaydi (fixed'dan tashqari).
class CatalogItemDraft {
  final String name;
  final String? productId;
  final String calcType;
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
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (qty != null) 'qty': qty,
        if (sizeVariant != null) 'sizeVariant': sizeVariant,
        if (condition != null) 'condition': condition,
        if (price != null) 'price': price,
      };
}

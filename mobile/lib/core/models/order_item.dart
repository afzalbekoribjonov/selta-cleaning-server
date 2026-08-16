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

  const OrderItem({
    required this.id,
    required this.itemNumber,
    required this.name,
    required this.area,
    required this.price,
    required this.qcStatus,
    this.qcNote,
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
    );
  }

  String subId(int orderNumber) => '$orderNumber/$itemNumber';
}

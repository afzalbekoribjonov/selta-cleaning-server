import 'package:cloud_firestore/cloud_firestore.dart';

/// Admin panelda oldindan belgilangan narx katalogidagi mahsulot turi.
class Product {
  final String id;
  final String name;
  final String calcType; // 'sqm' | 'meter' | 'kg' | 'count' | 'size'
  final num? unitPrice;
  final num? smallPrice;
  final num? largePrice;

  const Product({
    required this.id,
    required this.name,
    required this.calcType,
    this.unitPrice,
    this.smallPrice,
    this.largePrice,
  });

  factory Product.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return Product(
      id: doc.id,
      name: data['name']?.toString() ?? '',
      calcType: data['calcType']?.toString() ?? 'count',
      unitPrice: data['unitPrice'] as num?,
      smallPrice: data['smallPrice'] as num?,
      largePrice: data['largePrice'] as num?,
    );
  }
}

class ConditionSurcharges {
  final num average;
  final num bad;
  final num veryBad;

  const ConditionSurcharges({this.average = 0, this.bad = 0, this.veryBad = 0});

  factory ConditionSurcharges.fromMap(Map<String, dynamic>? data) {
    if (data == null) return const ConditionSurcharges();
    return ConditionSurcharges(
      average: (data['average'] as num?) ?? 0,
      bad: (data['bad'] as num?) ?? 0,
      veryBad: (data['veryBad'] as num?) ?? 0,
    );
  }

  num percentFor(String? condition) => switch (condition) {
        'average' => average,
        'bad' => bad,
        'veryBad' => veryBad,
        _ => 0,
      };
}

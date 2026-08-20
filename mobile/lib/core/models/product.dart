import 'package:cloud_firestore/cloud_firestore.dart';

/// Bitta tarif uchun to'liq alohida narx tuzilmasi (talab: "Har tarif —
/// to'liq alohida narx") — calcType='size' bo'lsa kichik/katta, aks
/// holda birlik narx ishlatiladi.
class TariffPrice {
  final num? unitPrice;
  final num? smallPrice;
  final num? largePrice;

  const TariffPrice({this.unitPrice, this.smallPrice, this.largePrice});

  factory TariffPrice.fromMap(Map<String, dynamic>? data) {
    if (data == null) return const TariffPrice();
    return TariffPrice(
      unitPrice: data['unitPrice'] as num?,
      smallPrice: data['smallPrice'] as num?,
      largePrice: data['largePrice'] as num?,
    );
  }
}

/// Admin panelda oldindan belgilangan narx katalogidagi mahsulot turi.
class Product {
  final String id;
  final String name;
  final String calcType; // 'sqm' | 'meter' | 'kg' | 'count' | 'size'
  final List<String> tariffs;
  final Map<String, TariffPrice> pricesByTariff;

  const Product({
    required this.id,
    required this.name,
    required this.calcType,
    this.tariffs = const [],
    this.pricesByTariff = const {},
  });

  factory Product.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    final rawPrices = data['pricesByTariff'] as Map<String, dynamic>? ?? {};
    return Product(
      id: doc.id,
      name: data['name']?.toString() ?? '',
      calcType: data['calcType']?.toString() ?? 'count',
      tariffs: (data['tariffs'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      pricesByTariff: rawPrices.map((k, v) => MapEntry(k, TariffPrice.fromMap(v as Map<String, dynamic>?))),
    );
  }

  /// Mahsulot bu tarifga tegishlimi — eski (tariffs bo'sh) mahsulotlar
  /// hammaga ko'rinadi (moslik uchun).
  bool appliesToTariff(String tariff) => tariffs.isEmpty || tariffs.contains(tariff);

  /// Berilgan tarif uchun narx tuzilmasi — topilmasa bo'sh (0) qaytadi.
  TariffPrice priceFor(String? tariff) => pricesByTariff[tariff] ?? const TariffPrice();
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

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart' show authStateProvider;

/// Tarif sozlamalari — muddat va rang bosqichlari.
///
/// Avval bu qiymatlar ilovada, admin panelda va serverda QATTIQ yozilgan
/// edi; o'zgartirish uchun uchala loyihani qayta yig'ish kerak bo'lardi.
/// Endi ular `settings/tariffs` hujjatida turadi (admin panel orqali
/// tahrirlanadi), bu yerda esa faqat o'qiladi —
/// server/src/lib/tariffConfig.ts bilan aynan bir xil shakl va bir xil
/// standart qiymatlar.
class TariffSetting {
  /// Buyurtma muddati — mahsulot qo'shilgan kundan boshlab.
  final int days;

  /// Shu kungacha rang YASHIL (`elapsedDays < green`).
  final int green;

  /// Shu kungacha SARIQ, undan keyin QIZIL.
  final int yellow;

  const TariffSetting({required this.days, required this.green, required this.yellow});
}

typedef TariffConfig = Map<String, TariffSetting>;

/// Sozlama hujjati bo'lmaganda ishlatiladigan qiymatlar — bu maydonlar
/// joriy etilishidan oldingi qattiq yozilgan qiymatlarning aynan o'zi.
const TariffConfig kDefaultTariffs = {
  'express': TariffSetting(days: 4, green: 2, yellow: 3),
  'comfort': TariffSetting(days: 7, green: 3, yellow: 5),
  'standart': TariffSetting(days: 12, green: 4, yellow: 8),
  'premium': TariffSetting(days: 4, green: 2, yellow: 3),
};

/// Bitta yozuvni tekshiradi — qoida serverdagi bilan bir xil:
/// `1 <= green < yellow <= days`. Buzuq yozuv `null` qaytaradi va
/// o'rniga standart qiymat ishlatiladi.
TariffSetting? _parse(Object? raw) {
  if (raw is! Map) return null;
  final days = raw['days'];
  final green = raw['green'];
  final yellow = raw['yellow'];
  if (days is! int || green is! int || yellow is! int) return null;
  if (days < 1 || days > 365) return null;
  if (green < 1 || green >= yellow || yellow > days) return null;
  return TariffSetting(days: days, green: green, yellow: yellow);
}

/// Saqlangan hujjatni standart qiymatlar ustiga qo'yadi — yetishmagan
/// yoki buzuq yozuv standart qiymat bilan to'ldiriladi.
TariffConfig tariffsFromMap(Map<String, dynamic>? data) {
  return {
    for (final entry in kDefaultTariffs.entries)
      entry.key: _parse(data?[entry.key]) ?? entry.value,
  };
}

final tariffSettingsProvider = StreamProvider<TariffConfig>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance
      .collection('settings')
      .doc('tariffs')
      .snapshots()
      .map((doc) => tariffsFromMap(doc.data()));
});

/// Sozlama hali yuklanmagan bo'lsa standart qiymatlar — chaqiruvchi
/// bo'sh holatni alohida boshqarishi shart emas.
extension TariffSettingsRef on WidgetRef {
  TariffConfig get tariffs => watch(tariffSettingsProvider).valueOrNull ?? kDefaultTariffs;
}

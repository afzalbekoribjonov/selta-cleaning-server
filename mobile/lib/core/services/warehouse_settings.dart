import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart' show authStateProvider;

/// Admin sozlamasi yo'q bo'lsa — server/src/routes/warehouse.ts bilan bir xil.
const kDefaultWarehouseReadyDays = 5;

/// "Tayyor" bo'lganiga necha kun bo'lgan mahsulot omborga tushadi —
/// admin panel sozlamalarida o'zgartiriladi va jonli o'qiladi.
final warehouseReadyDaysProvider = StreamProvider<int>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance.collection('settings').doc('warehouse').snapshots().map((doc) {
    final value = doc.data()?['readyDays'];
    return value is int && value >= 1 && value <= 365 ? value : kDefaultWarehouseReadyDays;
  });
});

extension WarehouseSettingsRef on WidgetRef {
  int get warehouseReadyDays => watch(warehouseReadyDaysProvider).valueOrNull ?? kDefaultWarehouseReadyDays;
}

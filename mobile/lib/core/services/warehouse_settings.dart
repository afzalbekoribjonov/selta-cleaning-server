import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart' show authStateProvider;

/// Admin sozlamasi yo'q bo'lsa — server/src/routes/warehouse.ts bilan bir xil.
const kDefaultWarehouseDays = 10;

/// Omborga tushish chegarasi (kun) — admin panel sozlamalarida
/// o'zgartiriladi va jonli o'qiladi.
final warehouseThresholdProvider = StreamProvider<int>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance.collection('settings').doc('warehouse').snapshots().map((doc) {
    final value = doc.data()?['thresholdDays'];
    return value is int && value >= 1 && value <= 365 ? value : kDefaultWarehouseDays;
  });
});

extension WarehouseSettingsRef on WidgetRef {
  int get warehouseThreshold => watch(warehouseThresholdProvider).valueOrNull ?? kDefaultWarehouseDays;
}

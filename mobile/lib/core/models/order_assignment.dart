import 'package:cloud_firestore/cloud_firestore.dart';

/// Nazoratchi dastavchikka bergan topshiriq — buyurtma hujjatidagi
/// `assignment` maydoni (server: routes/supervisor.ts).
///
/// Buyurtmaning o'zida turadi: dastavchik ilovasi faol buyurtmalarni
/// allaqachon jonli o'qiydi, topshiriq qo'shimcha so'rovsiz ko'rinadi.
class OrderAssignment {
  final String driverId;
  final String driverName;

  /// Biznes kuni, "YYYY-MM-DD".
  final String date;

  /// 'pickup' — mijozdan olib kelish; 'delivery' — tayyorlarini yetkazish.
  final String kind;

  /// Yetkazishda — aynan qaysi mahsulotlar (bo'sh emas).
  final List<String> itemIds;

  /// Dastavchikning yo'l tartibi (0 dan).
  final int seq;
  final String? note;
  final String assignedByName;
  final DateTime? assignedAt;

  const OrderAssignment({
    required this.driverId,
    required this.driverName,
    required this.date,
    required this.kind,
    this.itemIds = const [],
    this.seq = 0,
    this.note,
    this.assignedByName = '',
    this.assignedAt,
  });

  bool get isPickup => kind == 'pickup';

  static OrderAssignment? fromRaw(Object? raw) {
    if (raw is! Map) return null;
    final driverId = raw['driverId']?.toString();
    final date = raw['date']?.toString();
    if (driverId == null || driverId.isEmpty || date == null || date.isEmpty) return null;
    return OrderAssignment(
      driverId: driverId,
      driverName: raw['driverName']?.toString() ?? 'Dastavchik',
      date: date,
      kind: raw['kind']?.toString() == 'pickup' ? 'pickup' : 'delivery',
      itemIds: (raw['itemIds'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      seq: (raw['seq'] as num?)?.toInt() ?? 0,
      note: (raw['note']?.toString().trim().isEmpty ?? true) ? null : raw['note'].toString().trim(),
      assignedByName: raw['assignedByName']?.toString() ?? '',
      assignedAt: (raw['assignedAt'] as Timestamp?)?.toDate(),
    );
  }
}

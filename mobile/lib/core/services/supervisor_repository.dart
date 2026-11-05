import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/cached_fetch.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'local_store.dart';
import 'my_activity_repository.dart';
import 'stats_repository.dart' show dateKeyOf;

/// Nazoratchi uchun xodim (server: routes/supervisor.ts `/supervisorStaff`).
class StaffMember {
  final String id;
  final String fullName;
  final String department;
  final String departmentLabel;
  final List<String> specializations;
  final bool canPack;
  final int washed;
  final int packed;
  final int delivered;
  final num deliveredTotal;
  final int pickedUp;
  final int created;
  final int pendingWarnings;

  /// Davomat: 'on_time' | 'late' (belgilanmagan bo'lsa null).
  final String? attendanceStatus;
  final String? attendanceTime;

  const StaffMember({
    required this.id,
    required this.fullName,
    required this.department,
    required this.departmentLabel,
    this.specializations = const [],
    this.canPack = false,
    this.washed = 0,
    this.packed = 0,
    this.delivered = 0,
    this.deliveredTotal = 0,
    this.pickedUp = 0,
    this.created = 0,
    this.pendingWarnings = 0,
    this.attendanceStatus,
    this.attendanceTime,
  });

  bool get isWorker => department == 'worker';
  bool get isDriver => department == 'delivery';

  /// Bugun qilgan ishi bo'lsa.
  int get workTotal => washed + packed + delivered + pickedUp + created;

  factory StaffMember.fromJson(Map<String, dynamic> j) {
    final att = j['attendance'];
    return StaffMember(
      id: j['id'] as String,
      fullName: j['fullName'] as String? ?? "Noma'lum",
      department: j['department'] as String? ?? '',
      departmentLabel: j['departmentLabel'] as String? ?? '',
      specializations: (j['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      canPack: j['canPack'] == true,
      washed: (j['washed'] as num?)?.toInt() ?? 0,
      packed: (j['packed'] as num?)?.toInt() ?? 0,
      delivered: (j['delivered'] as num?)?.toInt() ?? 0,
      deliveredTotal: (j['deliveredTotal'] as num?) ?? 0,
      pickedUp: (j['pickedUp'] as num?)?.toInt() ?? 0,
      created: (j['created'] as num?)?.toInt() ?? 0,
      pendingWarnings: (j['pendingWarnings'] as num?)?.toInt() ?? 0,
      attendanceStatus: att is Map ? att['status']?.toString() : null,
      attendanceTime: att is Map ? att['time']?.toString() : null,
    );
  }
}

/// Ogohlantirishlar tarixidagi bitta yozuv.
class WarningEntry {
  final String id;
  final String text;
  final String createdByName;
  final DateTime? createdAt;
  final DateTime? ackAt;

  const WarningEntry({required this.id, required this.text, required this.createdByName, this.createdAt, this.ackAt});

  factory WarningEntry.fromJson(Map<String, dynamic> j) => WarningEntry(
        id: j['id'] as String,
        text: j['text'] as String? ?? '',
        createdByName: j['createdByName'] as String? ?? '',
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal(),
        ackAt: DateTime.tryParse(j['ackAt'] as String? ?? '')?.toLocal(),
      );
}

/// Topshiriqdagi bitta buyurtma: [itemIds] bo'sh — hozir tayyorlarining hammasi.
typedef AssignmentStop = ({String orderId, List<String> itemIds});

class SupervisorRepository {
  final ApiClient _api;
  SupervisorRepository(this._api);

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw StateError('Tizimga kirilmagan');
    return _api.post(path, idToken: token, body: body);
  }

  Future<Map<String, dynamic>> fetchStaffRaw(String date) => _post('/supervisorStaff', {'date': date});

  Future<Map<String, dynamic>> fetchEmployeeActivityRaw(String employeeId, String date) =>
      _post('/supervisorEmployeeActivity', {'employeeId': employeeId, 'date': date});

  /// Dastavchikning [date] kungi topshirig'ini to'liq ro'yxat sifatida saqlaydi.
  Future<({int assigned, int cleared})> assignDeliveries({
    required String driverId,
    required String date,
    required List<AssignmentStop> stops,
    String? note,
  }) async {
    final r = await _post('/supervisorAssignDeliveries', {
      'driverId': driverId,
      'date': date,
      'stops': [
        for (final s in stops) {'orderId': s.orderId, if (s.itemIds.isNotEmpty) 'itemIds': s.itemIds},
      ],
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    });
    return (assigned: (r['assigned'] as num?)?.toInt() ?? 0, cleared: (r['cleared'] as num?)?.toInt() ?? 0);
  }

  Future<void> clearAssignment(String orderId) => _post('/supervisorClearAssignment', {'orderId': orderId});

  Future<void> warnEmployee(String employeeId, String text) =>
      _post('/supervisorWarnEmployee', {'employeeId': employeeId, 'text': text});

  Future<List<WarningEntry>> fetchWarnings(String employeeId) async {
    final r = await _post('/employeeWarnings', {'employeeId': employeeId});
    return [for (final w in (r['warnings'] as List? ?? const [])) WarningEntry.fromJson(Map<String, dynamic>.from(w as Map))];
  }

  /// Har qanday xodim — o'zining ogohlantirishi bilan tanishganini belgilaydi.
  Future<void> acknowledgeWarning(String warningId) => _post('/acknowledgeWarning', {'warningId': warningId});
}

final supervisorRepositoryProvider = Provider<SupervisorRepository>((ref) => SupervisorRepository(ref.watch(apiClientProvider)));

/// Faol xodimlar va [date] kungi ishi. Internetsiz — oxirgi olingan nusxa.
final supervisorStaffProvider = FutureProvider.autoDispose.family<List<StaffMember>, String>((ref, date) async {
  ref.watch(authStateProvider);
  final isToday = date == dateKeyOf(DateTime.now());
  final raw = await fetchWithCache(
    ref.read(localStoreProvider),
    'cache.supervisorStaff.$date',
    () => ref.read(supervisorRepositoryProvider).fetchStaffRaw(date),
    usable: isToday ? savedToday : (_) => true,
  );
  return [
    for (final e in (raw['employees'] as List? ?? const [])) StaffMember.fromJson(Map<String, dynamic>.from(e as Map)),
  ];
});

/// Bitta xodimning [date] kungi ishi (profil sahifasidagi bilan bir xil model).
final staffActivityProvider =
    FutureProvider.autoDispose.family<MyDailyActivity, ({String employeeId, String date})>((ref, key) async {
  ref.watch(authStateProvider);
  final raw = await ref.read(supervisorRepositoryProvider).fetchEmployeeActivityRaw(key.employeeId, key.date);
  return MyDailyActivity.fromJson(raw);
});

final staffWarningsProvider = FutureProvider.autoDispose.family<List<WarningEntry>, String>((ref, employeeId) async {
  ref.watch(authStateProvider);
  return ref.read(supervisorRepositoryProvider).fetchWarnings(employeeId);
});

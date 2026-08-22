import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'api_client.dart';
import 'auth_service.dart' show apiClientProvider, authStateProvider;

/// "Davomat nazorati" sozlamalari — admin panelda belgilanadi, barcha
/// xodimlar uchun bitta (talab: "Butun kompaniya uchun bitta qoida").
/// Xodim ilovasi faqat oyna vaqtini bilishi kerak — joylashuv/radius
/// tekshiruvi to'liq serverda amalga oshadi.
class AttendanceConfig {
  final bool enabled;
  final String arrivalTime; // "08:00"
  final int lateToleranceMinutes;

  const AttendanceConfig({required this.enabled, required this.arrivalTime, required this.lateToleranceMinutes});

  factory AttendanceConfig.fromMap(Map<String, dynamic>? data) {
    return AttendanceConfig(
      enabled: data?['enabled'] == true,
      arrivalTime: data?['arrivalTime']?.toString() ?? '08:00',
      lateToleranceMinutes: (data?['lateToleranceMinutes'] as num?)?.toInt() ?? 30,
    );
  }

  /// Berilgan vaqt davomat oynasi ichidami (ishga kelish vaqtidan
  /// kechikish chegarasigacha).
  bool isWithinWindow(DateTime now) {
    if (!enabled) return false;
    final parts = arrivalTime.split(':');
    if (parts.length != 2) return false;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return false;
    final arrivalMinutes = h * 60 + m;
    final nowMinutes = now.hour * 60 + now.minute;
    return nowMinutes >= arrivalMinutes && nowMinutes < arrivalMinutes + lateToleranceMinutes;
  }
}

final attendanceConfigProvider = StreamProvider<AttendanceConfig>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance
      .collection('settings')
      .doc('attendance')
      .snapshots()
      .map((doc) => AttendanceConfig.fromMap(doc.data()));
});

/// Talab: davomat bilan bog'liq hech narsa ilovada ko'rinmasin — shuning
/// uchun bu servis hech qanday UI holatini boshqarmaydi, xatolarni ham
/// sokin yutadi (fire-and-forget).
class AttendanceService {
  final ApiClient _api;
  AttendanceService(this._api);

  Future<void> tryCheckin({required String idToken}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return;

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      await _api.post(
        '/submitAttendanceCheckin',
        idToken: idToken,
        body: {'lat': position.latitude, 'lng': position.longitude},
      );
    } catch (_) {
      // Sokin — talab: "ilovada davomatga oid hech qanday narsa
      // ko'rsatilmaydi", shuning uchun xatolik ham hech qanday holatda
      // foydalanuvchiga ko'rsatilmaydi.
    }
  }
}

final attendanceServiceProvider = Provider<AttendanceService>((ref) => AttendanceService(ref.watch(apiClientProvider)));

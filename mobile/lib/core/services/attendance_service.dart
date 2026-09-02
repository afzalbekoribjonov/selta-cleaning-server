import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'api_client.dart';
import 'auth_service.dart' show apiClientProvider, authStateProvider;

/// "Davomat nazorati" sozlamalari — admin panelda belgilanadi, barcha
/// xodimlar uchun bitta (talab: "Butun kompaniya uchun bitta qoida").
///
/// Klient endi VAQTNI O'ZI TEKSHIRMAYDI — faqat nazorat umuman
/// yoqilgan-yoqilmaganini biladi. Sabab: avval klient qurilmaning
/// mahalliy soatidan (`DateTime.now().hour`) foydalanib oynani
/// tekshirardi, server esa qat'iy UTC+5 dan. Telefon vaqt zonasi yoki
/// soati noto'g'ri bo'lsa, klient serverga umuman murojaat qilmay,
/// xodim jimgina "kelmagan" bo'lib qolardi. Endi qaror faqat serverda.
class AttendanceConfig {
  final bool enabled;

  const AttendanceConfig({required this.enabled});

  factory AttendanceConfig.fromMap(Map<String, dynamic>? data) {
    return AttendanceConfig(enabled: data?['enabled'] == true);
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

  /// Shu kun uchun ish tugagan (belgilangan yoki belgilashning hojati
  /// yo'q) — keyingi urinishlarda GPS o'qishga umuman kirishmaslik uchun.
  /// Faqat xotirada: ilova qayta ishga tushsa yana bir marta tekshiradi,
  /// bu esa zararsiz (server idempotent).
  String? _settledDate;

  String _todayKey() {
    final now = DateTime.now();
    return '${now.year}-${now.month}-${now.day}';
  }

  Future<void> tryCheckin({required String idToken}) async {
    final today = _todayKey();
    if (_settledDate == today) return;

    try {
      // Joylashuvni o'qib bo'lmasa — adminga sababi bilan xabar beriladi,
      // shunda u "kelmagan" bilan "GPS o'chiq"ni farqlay oladi.
      if (!await Geolocator.isLocationServiceEnabled()) {
        await _reportIssue(idToken, 'location_off');
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        await _reportIssue(idToken, 'permission_denied');
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      final result = await _api.post(
        '/submitAttendanceCheckin',
        idToken: idToken,
        body: {'lat': position.latitude, 'lng': position.longitude},
      );

      // Belgilandi yoki allaqachon belgilangan / nazorat o'chiq — bugun
      // qayta urinish shart emas. "out_of_range" bo'lsa esa urinaveramiz:
      // xodim hali yo'lda bo'lishi mumkin.
      final recorded = result['recorded'] == true;
      final reason = result['reason']?.toString();
      if (recorded || reason == 'already' || reason == 'disabled' || reason == 'not_enrolled') {
        _settledDate = today;
      }
    } catch (_) {
      // Sokin — talab: "ilovada davomatga oid hech qanday narsa
      // ko'rsatilmaydi", shuning uchun xatolik ham hech qanday holatda
      // foydalanuvchiga ko'rsatilmaydi.
    }
  }

  Future<void> _reportIssue(String idToken, String issue) async {
    try {
      await _api.post('/submitAttendanceCheckin', idToken: idToken, body: {'issue': issue});
    } catch (_) {
      // Sokin.
    }
  }
}

final attendanceServiceProvider = Provider<AttendanceService>((ref) => AttendanceService(ref.watch(apiClientProvider)));

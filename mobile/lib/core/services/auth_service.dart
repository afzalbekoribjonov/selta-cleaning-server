import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/employee_summary.dart';
import 'api_client.dart';
import 'local_store.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// Joriy tizimga kirgan xodimning custom-claims'lari (role, employeeId,
/// department) — loginWithPin orqali mint qilingan token ichida keladi.
/// Auth holati o'zgarganda qayta o'qiladi.
///
/// Token MAJBURAN yangilanmaydi: claim'lar kirish paytidagi tokenga
/// yozilgan va yangilash ularga hech narsa qo'shmaydi. Avval
/// `getIdTokenResult(true)` edi — bu har startda Google serverlariga
/// so'rov yuborardi (ekran shuni kutib qolardi), internetsiz esa
/// butunlay xato berib, xodimning roli ham, ID'si ham aniqlanmay qolardi.
///
/// Token muddati o'tgan va internet yo'q bo'lsa ham ilova ishlashi uchun
/// claim'lar qurilmada saqlanadi va shu holatda o'sha nusxadan olinadi.
final employeeClaimsProvider = FutureProvider<EmployeeClaims?>((ref) async {
  final user = ref.watch(authStateProvider).value;
  if (user == null) return null;

  final store = ref.read(localStoreProvider);
  final cacheKey = 'claims.${user.uid}';
  try {
    final parsed = EmployeeClaims.fromClaims((await user.getIdTokenResult()).claims);
    if (parsed != null) await store.setJson(cacheKey, parsed.toJson());
    return parsed;
  } catch (_) {
    // Internetsiz va token muddati o'tgan — oxirgi ma'lum nusxa.
    return EmployeeClaims.fromJson(store.getJson(cacheKey));
  }
});

class AuthService {
  final ApiClient _api;

  AuthService(this._api);

  Future<List<EmployeeSummary>> listEmployeesByDepartment(String department) async {
    final result = await _api.post('/listEmployeesByDepartment', body: {'department': department});
    final employees = result['employees'] as List<Object?>;
    return employees
        .map((e) => EmployeeSummary.fromMap(Map<Object?, Object?>.from(e as Map)))
        .toList();
  }

  /// PIN'ni serverda tekshiradi, muvaffaqiyatli bo'lsa custom token bilan
  /// signInWithCustomToken qiladi — shundan keyin Firebase Auth'ning o'zi
  /// sessiyani lokal persist qiladi (qaror #4: qo'shimcha keshlash shart
  /// emas).
  Future<void> loginWithPin({required String employeeId, required String pin}) async {
    final result = await _api.post('/loginWithPin', body: {'employeeId': employeeId, 'pin': pin});
    final token = result['token'] as String;
    await FirebaseAuth.instance.signInWithCustomToken(token);
  }

  Future<void> logout() => FirebaseAuth.instance.signOut();
}

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(ref.watch(apiClientProvider)),
);

/// Server xatolarini foydalanuvchiga tushunarli o'zbekcha xabarga
/// aylantiradi — server hali deploy qilinmagan/uxlab yotgan bo'lsa ham
/// (Render bepul reja) tushunarli xabar ko'rsatiladi.
String describeApiError(Object error) {
  if (error is ApiException) {
    if (error.status == 0) return error.message;
    return error.message;
  }
  return "Ulanishda xatolik yuz berdi";
}

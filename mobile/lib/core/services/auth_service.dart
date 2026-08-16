import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/employee_summary.dart';
import 'api_client.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// Joriy tizimga kirgan xodimning custom-claims'lari (role, employeeId,
/// department) — loginWithPin orqali mint qilingan token ichida keladi.
/// Auth holati o'zgarganda qayta o'qiladi.
final employeeClaimsProvider = FutureProvider<EmployeeClaims?>((ref) async {
  final authState = ref.watch(authStateProvider);
  final user = authState.value;
  if (user == null) return null;

  final tokenResult = await user.getIdTokenResult(true);
  final claims = tokenResult.claims;
  if (claims == null || claims['employeeId'] == null) return null;

  return EmployeeClaims(
    employeeId: claims['employeeId'] as String,
    role: claims['role'] as String,
    department: claims['department'] as String,
  );
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

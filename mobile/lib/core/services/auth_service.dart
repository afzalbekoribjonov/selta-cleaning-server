import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/employee_summary.dart';

/// Cloud Functions `asia-southeast1`da joylashgan (Firestore bilan bir xil
/// region) — firebase/functions/src/lib/globalOptions.ts'ga qarang.
final firebaseFunctionsProvider = Provider<FirebaseFunctions>(
  (ref) => FirebaseFunctions.instanceFor(region: 'asia-southeast1'),
);

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
  final FirebaseFunctions _functions;

  AuthService(this._functions);

  Future<List<EmployeeSummary>> listEmployeesByDepartment(String department) async {
    final callable = _functions.httpsCallable('listEmployeesByDepartment');
    final result = await callable.call<List<Object?>>({'department': department});
    return result.data
        .map((e) => EmployeeSummary.fromMap(Map<Object?, Object?>.from(e as Map)))
        .toList();
  }

  /// PIN'ni serverda tekshiradi, muvaffaqiyatli bo'lsa custom token bilan
  /// signInWithCustomToken qiladi — shundan keyin Firebase Auth'ning o'zi
  /// sessiyani lokal persist qiladi (qaror #4: qo'shimcha keshlash shart
  /// emas).
  Future<void> loginWithPin({required String employeeId, required String pin}) async {
    final callable = _functions.httpsCallable('loginWithPin');
    final result = await callable.call<Map<String, dynamic>>({
      'employeeId': employeeId,
      'pin': pin,
    });
    final token = result.data['token'] as String;
    await FirebaseAuth.instance.signInWithCustomToken(token);
  }

  Future<void> logout() => FirebaseAuth.instance.signOut();
}

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(ref.watch(firebaseFunctionsProvider)),
);

/// firebase_functions xatolarini foydalanuvchiga tushunarli o'zbekcha
/// xabarga aylantiradi — loginWithPin/listEmployeesByDepartment kabi
/// callable'lar hali serverga chiqmagan bo'lsa ham (Blaze rejasi
/// yoqilmagan), bu yerda tushunarli xabar ko'rsatiladi.
String describeFunctionsError(Object error) {
  if (error is FirebaseFunctionsException) {
    switch (error.code) {
      case 'permission-denied':
        return error.message ?? "PIN noto'g'ri";
      case 'resource-exhausted':
        return error.message ?? "Juda ko'p urinish — birozdan so'ng qayta urining";
      case 'not-found':
        return error.message ?? 'Topilmadi';
      case 'unavailable':
      case 'internal':
        return "Server hali tayyor emas — birozdan so'ng qayta urining";
      default:
        return error.message ?? "Noma'lum xatolik yuz berdi";
    }
  }
  return "Ulanishda xatolik yuz berdi";
}

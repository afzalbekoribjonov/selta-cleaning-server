import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';

/// Har bir bo'lim uchun umumiy xodim paneli qobig'i (Faza 2 — navigatsiya
/// skeleti). Yuqorida shaxsiy statistika banneri (talab: "har bir ishchi
/// panelida yuqorida alohida statistikada ko'rinib turishi shart") joy
/// egallovchisi bilan; bo'limga xos funksiyalar (buyurtmalar, QC navbati
/// va h.k.) Faza 3/4'da shu qobiq ichiga qo'shiladi.
class EmployeeHomeScreen extends ConsumerWidget {
  const EmployeeHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claimsAsync = ref.watch(employeeClaimsProvider);
    final employeeAsync = ref.watch(currentEmployeeProvider);

    return claimsAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, _) => Scaffold(body: Center(child: Text(describeApiError(err)))),
      data: (claims) {
        if (claims == null) {
          // Sessiya kutilmaganda tugagan bo'lsa — bo'lim tanlashga qaytarish.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (context.mounted) context.go('/select');
          });
          return const Scaffold(body: SizedBox.shrink());
        }

        final department = Department.values.firstWhere(
          (d) => d.name == claims.department,
          orElse: () => Department.dispatcher,
        );
        final info = kDepartmentConfig[department]!;
        final fullName = employeeAsync.value?['fullName'] as String? ?? '...';

        return Scaffold(
          body: SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                  decoration: const BoxDecoration(gradient: heroGradient),
                  child: Row(
                    children: [
                      Icon(info.icon, color: Colors.white, size: 26),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              fullName,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17),
                            ),
                            Text(
                              info.label,
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () async {
                          await ref.read(authServiceProvider).logout();
                          if (context.mounted) context.go('/select');
                        },
                        icon: const Icon(Icons.logout_rounded, color: Colors.white),
                        tooltip: 'Chiqish',
                      ),
                    ],
                  ),
                ),
                _TopStatsBanner(department: department),
                const Expanded(
                  child: Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        "Bo'limga xos funksiyalar tez orada qo'shiladi",
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Shaxsiy statistika banneri joy egallovchisi — kechikkan buyurtmalar/
/// bugungi hajm kabi ko'rsatkichlar Faza 3/4'da shu yerga ulanadi.
class _TopStatsBanner extends StatelessWidget {
  final Department department;
  const _TopStatsBanner({required this.department});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: const Row(
        children: [
          Icon(Icons.query_stats_rounded, color: AppColors.primary, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Statistika — tez orada',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.grayDark),
            ),
          ),
        ],
      ),
    );
  }
}

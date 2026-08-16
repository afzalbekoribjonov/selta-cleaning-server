import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/services/auth_service.dart';
import '../delivery/delivery_home_screen.dart';
import '../dispatcher/dispatcher_home_screen.dart';
import '../qc/qc_home_screen.dart';
import '../worker/worker_home_screen.dart';

/// `/home` — claims.department'ga qarab tegishli bo'lim paneliga
/// yo'naltiradi. Har bir bo'lim (Dispetcher/Ishchi/Dastavchik/Sifat
/// nazorati) o'zining to'liq ekraniga ega (Faza 3/4).
class EmployeeHomeScreen extends ConsumerWidget {
  const EmployeeHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claimsAsync = ref.watch(employeeClaimsProvider);

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

        return switch (department) {
          Department.dispatcher => const DispatcherHomeScreen(),
          Department.worker => const WorkerHomeScreen(),
          Department.delivery => const DeliveryHomeScreen(),
          Department.qc => const QcHomeScreen(),
        };
      },
    );
  }
}

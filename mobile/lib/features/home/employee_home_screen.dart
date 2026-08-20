import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/fcm_service.dart';
import '../../core/widgets/selta_loader.dart';
import '../delivery/delivery_home_screen.dart';
import '../dispatcher/dispatcher_home_screen.dart';
import '../other/other_home_screen.dart';
import '../worker/worker_home_screen.dart';

/// `/home` — claims.department'ga qarab tegishli bo'lim paneliga
/// yo'naltiradi. Har bir bo'lim (Sotuv menejeri/Ishchi/Dastavchik)
/// o'zining to'liq ekraniga ega. "Sifat nazorati" bo'limi olib
/// tashlangan — uning ishi endi ishchining "upakovka" bosqichiga
/// birlashtirilgan (talab #5).
class EmployeeHomeScreen extends ConsumerWidget {
  const EmployeeHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claimsAsync = ref.watch(employeeClaimsProvider);

    return claimsAsync.when(
      loading: () => const Scaffold(body: SeltaLoadingView()),
      error: (err, _) => Scaffold(body: Center(child: Text(describeApiError(err)))),
      data: (claims) {
        if (claims == null) {
          // Sessiya kutilmaganda tugagan bo'lsa — bo'lim tanlashga qaytarish.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (context.mounted) context.go('/select');
          });
          return const Scaffold(body: SizedBox.shrink());
        }

        // Xodim uchun push-bildirishnoma ro'yxatdan o'tishi — bir marta,
        // xatolik bo'lsa ham panelni bloklamaydi (natijasi e'tiborga
        // olinmaydi, shunchaki fon vazifasi sifatida ishga tushadi).
        ref.watch(fcmRegistrationProvider(claims.employeeId));

        // "Boshqa" (customDepartments orqali yaratilgan) kasblar 4 ta
        // doimiy Department qiymatidan hech biriga mos kelmaydi — bunday
        // holatda avvalgi kod xato ravishda Dispetcher paneliga
        // yo'naltirar edi; endi tayinlangan topshiriqlar ekraniga o'tadi.
        Department? department;
        for (final d in Department.values) {
          if (d.name == claims.department) department = d;
        }
        if (department == null) {
          return const OtherHomeScreen();
        }

        return switch (department) {
          Department.dispatcher => const DispatcherHomeScreen(),
          Department.worker => const WorkerHomeScreen(),
          Department.delivery => const DeliveryHomeScreen(),
        };
      },
    );
  }
}

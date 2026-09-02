import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import 'create_order_screen.dart';

/// 4 ta bo'lim panelining bir xil AppBar'i — bo'lim nomi va xodim ismi
/// ko'rsatiladi, ism bosilsa profil/sozlamalar sahifasi ochiladi (talab #6:
/// yuqori o'ngdagi alohida "chiqish" tugmasi olib tashlandi, chiqish endi
/// shu sahifa ichida, tasdiqlashdan so'ng amalga oshadi). Talab: admin
/// panelda "Buyurtma yaratish huquqi" berilgan (sotuv menejeri bo'lmagan)
/// xodimlar uchun o'ng burchakda "+" tugmasi — bosilsa Yangi buyurtma
/// sahifasi ochiladi ("O'zi keldi" bilan).
class EmployeeAppBar extends ConsumerWidget implements PreferredSizeWidget {
  final String departmentLabel;
  final String employeeName;

  const EmployeeAppBar({super.key, required this.departmentLabel, required this.employeeName});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employee = ref.watch(currentEmployeeProvider).valueOrNull;
    final department = employee?['department'] as String?;
    final canCreateOrders = employee?['canCreateOrders'] as bool? ?? false;
    final showCreateOrderButton = canCreateOrders && department != 'dispatcher';
    // Talab: vakolat berilgan xodim uchun o'ng yuqori burchakda kunlik
    // ko'rsatkichlar tugmasi.
    final canViewStats = employee?['canViewStats'] as bool? ?? false;

    return AppBar(
      actions: [
        if (canViewStats)
          IconButton(
            onPressed: () => context.push('/stats'),
            tooltip: "Kunlik ko'rsatkichlar",
            style: IconButton.styleFrom(backgroundColor: AppColors.primary.withValues(alpha: 0.1)),
            icon: const Icon(Icons.insights_rounded, color: AppColors.primary, size: 20),
          ),
        if (showCreateOrderButton)
          IconButton(
            onPressed: () => openCreateOrderScreen(context),
            tooltip: 'Yangi buyurtma yaratish',
            style: IconButton.styleFrom(backgroundColor: AppColors.primary.withValues(alpha: 0.1)),
            icon: Container(
              width: 30,
              height: 30,
              decoration: const BoxDecoration(gradient: heroGradient, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: const Icon(Icons.add_rounded, color: Colors.white, size: 18),
            ),
          ),
        const SizedBox(width: 8),
      ],
      title: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => context.push('/profile'),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 34,
                height: 34,
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(gradient: heroGradient, shape: BoxShape.circle),
                child: Image.asset('assets/brand/icon_white.png', fit: BoxFit.contain),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(departmentLabel),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          employeeName,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.grayDark),
                        ),
                      ),
                      const SizedBox(width: 2),
                      const Icon(Icons.chevron_right_rounded, size: 15, color: AppColors.grayDark),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/sync/sync_status_button.dart';
import '../search/global_search_screen.dart';
import 'create_order_screen.dart';

/// Barcha bo'lim panellarining bir xil AppBar'i — bo'lim nomi va xodim
/// ismi (bosilsa profil sahifasi). O'ng tomonda:
///  - sinxronlash belgisi (faqat kerak bo'lganda ko'rinadi);
///  - umumiy qidiruv — butun bazadan, telefon yoki buyurtma ID'si bo'yicha;
///  - ⋮ menyu — vakolatga bog'liq va kam ishlatiladigan amallar.
///
/// Avval vakolatli tugmalar ("Yangi buyurtma", "Kunlik ko'rsatkichlar")
/// to'g'ridan-to'g'ri yuqorida turardi — har yangi vakolat bilan ular
/// ko'payib, sarlavhani siqib qo'yardi. Endi hammasi bitta menyuda,
/// xodimga faqat o'ziga ruxsat berilganlari ko'rinadi.
class EmployeeAppBar extends ConsumerWidget implements PreferredSizeWidget {
  final String departmentLabel;
  final String employeeName;

  const EmployeeAppBar({super.key, required this.departmentLabel, required this.employeeName});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppBar(
      actions: [
        const SyncStatusButton(),
        IconButton(
          onPressed: () => openGlobalSearch(context),
          tooltip: 'Qidiruv',
          icon: const Icon(Icons.search_rounded, color: AppColors.ink),
        ),
        const EmployeeMenuButton(),
        const SizedBox(width: 4),
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
              // Flexible: o'ngdagi qidiruv/menyu belgilari joy egallagach,
              // uzun bo'lim nomi (admin yaratgan maxsus bo'limlar) yoki katta
              // shrift sozlamasida sarlavha ekrandan chiqib ketmasin.
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(departmentLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
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
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _MenuAction { createOrder, stats, dailyReceipt, warehouse, expenses, printer, profile, sync }

/// ⋮ menyu — xodimga FAQAT o'ziga ruxsat berilgan amallar ko'rinadi.
///
/// Vakolatlar admin panelda xodim sahifasida beriladi; ruxsat o'zgarsa
/// menyu qayta kirishsiz yangilanadi (xodim profili jonli oqim).
class EmployeeMenuButton extends ConsumerWidget {
  const EmployeeMenuButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employee = ref.watch(currentEmployeeProvider).valueOrNull;
    final department = employee?['department'] as String?;
    // Sotuv menejeri uchun buyurtma yaratish asosiy bo'limning o'zida.
    final canCreateOrders = (employee?['canCreateOrders'] as bool? ?? false) && department != 'dispatcher';
    final canViewStats = employee?['canViewStats'] as bool? ?? false;
    final canAccessWarehouse = employee?['canAccessWarehouse'] as bool? ?? false;
    final canAddExpenses = employee?['canAddExpenses'] as bool? ?? false;
    // Printer sozlamasi — chek chiqara oladiganlarga.
    final canDailyReceipt = employee?['canPrintDailyReport'] == true;
    final canPrint = employee?['canPrintReceipts'] == true || canDailyReceipt;
    final hasExtras = canCreateOrders || canViewStats || canAccessWarehouse || canAddExpenses || canPrint;

    return PopupMenuButton<_MenuAction>(
      tooltip: 'Boshqa amallar',
      icon: const Icon(Icons.more_vert_rounded, color: AppColors.ink),
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      onSelected: (action) {
        switch (action) {
          case _MenuAction.createOrder:
            openCreateOrderScreen(context);
          case _MenuAction.stats:
            context.push('/stats');
          case _MenuAction.dailyReceipt:
            context.push('/daily-receipt');
          case _MenuAction.warehouse:
            context.push('/warehouse');
          case _MenuAction.expenses:
            context.push('/expenses');
          case _MenuAction.printer:
            context.push('/printer');
          case _MenuAction.profile:
            context.push('/profile');
          case _MenuAction.sync:
            showSyncSheet(context);
        }
      },
      itemBuilder: (context) => [
        if (canCreateOrders) _item(_MenuAction.createOrder, Icons.add_circle_rounded, 'Yangi buyurtma'),
        if (canViewStats) _item(_MenuAction.stats, Icons.insights_rounded, "Kunlik ko'rsatkichlar"),
        if (canDailyReceipt) _item(_MenuAction.dailyReceipt, Icons.summarize_rounded, 'Kunlik hisobot cheki'),
        if (canAccessWarehouse) _item(_MenuAction.warehouse, Icons.warehouse_rounded, 'Omborxona'),
        if (canAddExpenses) _item(_MenuAction.expenses, Icons.receipt_long_rounded, 'Chiqimlar'),
        if (canPrint) _item(_MenuAction.printer, Icons.print_rounded, 'Printer'),
        if (hasExtras) const PopupMenuDivider(),
        _item(_MenuAction.profile, Icons.person_rounded, 'Bugungi ishim'),
        _item(_MenuAction.sync, Icons.sync_rounded, 'Sinxronlash holati'),
      ],
    );
  }

  PopupMenuItem<_MenuAction> _item(_MenuAction value, IconData icon, String label) {
    return PopupMenuItem(
      value: value,
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          // Katta shrift sozlamasida ham menyu kengligidan chiqmasin.
          Flexible(
            child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

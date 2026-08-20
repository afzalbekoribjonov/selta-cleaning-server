import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';

/// 4 ta bo'lim panelining bir xil AppBar'i — bo'lim nomi va xodim ismi
/// ko'rsatiladi, ism bosilsa profil/sozlamalar sahifasi ochiladi (talab #6:
/// yuqori o'ngdagi alohida "chiqish" tugmasi olib tashlandi, chiqish endi
/// shu sahifa ichida, tasdiqlashdan so'ng amalga oshadi).
class EmployeeAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String departmentLabel;
  final String employeeName;

  const EmployeeAppBar({super.key, required this.departmentLabel, required this.employeeName});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
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

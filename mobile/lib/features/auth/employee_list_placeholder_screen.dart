import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';

/// Vaqtinchalik joy egallovchi ekran — xodimlar ro'yxati + PIN pad
/// (talab #2) Faza 2'da shu joyga quriladi. Hozircha Faza 0 maqsadi:
/// navigatsiya va brend ko'rinishini tekshirish.
class EmployeeListPlaceholderScreen extends StatelessWidget {
  final String departmentName;

  const EmployeeListPlaceholderScreen({super.key, required this.departmentName});

  @override
  Widget build(BuildContext context) {
    final department = Department.values.firstWhere(
      (d) => d.name == departmentName,
      orElse: () => Department.dispatcher,
    );
    final info = kDepartmentConfig[department]!;

    return Scaffold(
      appBar: AppBar(title: Text(info.label)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(info.icon, size: 56, color: AppColors.primary),
              const SizedBox(height: 16),
              Text(
                '${info.label} — xodimlar ro‘yxati',
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
              ),
              const SizedBox(height: 8),
              const Text(
                'Xodim tanlash va PIN kirish shu yerda bo‘ladi (Faza 2).',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.grayDark),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

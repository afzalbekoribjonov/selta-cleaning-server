import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Xodim bo'limlari — mobil bosh ekranning 4 ta katta bo'limi.
/// "Sifat nazorati" alohida bo'lim sifatida (Ishchi paneli ichiga
/// aralashtirilmagan holda) — reja hujjatida qabul qilingan qaror.
enum Department { dispatcher, worker, delivery, qc }

class DepartmentInfo {
  final String label;
  final String description;
  final IconData icon;

  const DepartmentInfo({
    required this.label,
    required this.description,
    required this.icon,
  });
}

const Map<Department, DepartmentInfo> kDepartmentConfig = {
  Department.dispatcher: DepartmentInfo(
    label: 'Dispetcher',
    description: 'Buyurtmalarni qabul qilish va boshqarish',
    icon: Icons.headset_mic_rounded,
  ),
  Department.worker: DepartmentInfo(
    label: 'Ishchi',
    description: 'Yuvish va tayyorlash jarayoni',
    icon: Icons.handyman_rounded,
  ),
  Department.delivery: DepartmentInfo(
    label: 'Dastavchik',
    description: 'Olib ketish va yetkazib berish',
    icon: Icons.local_shipping_rounded,
  ),
  Department.qc: DepartmentInfo(
    label: 'Sifat nazorati',
    description: 'Tayyor mahsulotlarni tekshirish',
    icon: Icons.verified_rounded,
  ),
};

/// Buyurtma holati konfiguratsiyasi. Ikkita xizmat turi ikkita alohida
/// pipeline'ga ega (reja: bo'lim "Status pipeline"):
///  Olib kelish: new -> picked_up -> brought_in -> washing -> packing
///               -> qc_review -> ready -> done
///  Joyida yuvish: new -> team_assigned -> in_progress -> done
class StatusInfo {
  final String label;
  final IconData icon;
  final Color color;
  final Color background;

  const StatusInfo({
    required this.label,
    required this.icon,
    required this.color,
    required this.background,
  });
}

const Map<String, StatusInfo> kStatusConfig = {
  'new': StatusInfo(
    label: 'Yangi',
    icon: Icons.fiber_new_rounded,
    color: AppColors.info,
    background: Color(0xFFE8F1FC),
  ),
  'picked_up': StatusInfo(
    label: 'Olib ketildi',
    icon: Icons.inventory_2_rounded,
    color: Color(0xFF0E9488),
    background: Color(0xFFE3F8F6),
  ),
  'brought_in': StatusInfo(
    label: 'Sexga keldi',
    icon: Icons.warehouse_rounded,
    color: AppColors.grayDark,
    background: Color(0xFFF1EFF3),
  ),
  'washing': StatusInfo(
    label: 'Yuvilmoqda',
    icon: Icons.local_laundry_service_rounded,
    color: AppColors.info,
    background: Color(0xFFE8F1FC),
  ),
  'packing': StatusInfo(
    label: 'Upakovka',
    icon: Icons.inventory_rounded,
    color: Color(0xFF8A5A00),
    background: Color(0xFFFBF0DC),
  ),
  'qc_review': StatusInfo(
    label: 'Sifat nazoratida',
    icon: Icons.fact_check_rounded,
    color: AppColors.warning,
    background: Color(0xFFFFF4E0),
  ),
  'ready': StatusInfo(
    label: 'Tayyor',
    icon: Icons.check_circle_rounded,
    color: AppColors.success,
    background: Color(0xFFE5F7EC),
  ),
  'team_assigned': StatusInfo(
    label: 'Jamoa biriktirildi',
    icon: Icons.groups_rounded,
    color: AppColors.secondary,
    background: Color(0xFFF1E9F8),
  ),
  'in_progress': StatusInfo(
    label: 'Jarayonda',
    icon: Icons.cleaning_services_rounded,
    color: AppColors.info,
    background: Color(0xFFE8F1FC),
  ),
  'done': StatusInfo(
    label: 'Yakunlandi',
    icon: Icons.task_alt_rounded,
    color: AppColors.success,
    background: Color(0xFFE5F7EC),
  ),
};

StatusInfo statusOf(String? status) =>
    kStatusConfig[status] ?? kStatusConfig['new']!;

/// Xodim bo'limiga mos ravishda buyurtmada qaysi maydon unga tegishli
/// ekanini bildiradi (profil statistikasi uchun) — admin_web'dagi
/// DEPARTMENT_ATTRIBUTION_FIELD bilan bir xil mantiq.
String? attributionFieldFor(Department department) {
  switch (department) {
    case Department.dispatcher:
      return 'createdBy';
    case Department.worker:
      return 'washedBy';
    case Department.delivery:
      return 'deliveredBy';
    case Department.qc:
      return 'qcRatedBy';
  }
}

/// Har bir xizmat turi uchun to'liq status ketma-ketligi — dispetcher
/// progress-checklist'ida "bajarilgan / qolgan" ko'rsatish uchun.
const Map<String, List<String>> kServicePipeline = {
  'pickup': ['new', 'picked_up', 'brought_in', 'washing', 'packing', 'qc_review', 'ready', 'done'],
  'onsite': ['new', 'team_assigned', 'in_progress', 'done'],
};

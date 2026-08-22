import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Xodim bo'limlari — mobil bosh ekranning 3 ta katta bo'limi. "Sifat
/// nazorati" bo'limi olib tashlangan (talab #5) — uning ishi (item
/// pass/fail) endi istalgan ishchining "upakovka" bosqichiga tegishli.
enum Department { dispatcher, worker, delivery }

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
    label: 'Sotuv menejeri',
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
};

/// Buyurtma holati konfiguratsiyasi. Ikkita xizmat turi ikkita alohida
/// pipeline'ga ega:
///  Olib kelish (order-level): new -> brought_in -> done — dastavchik
///    mijozdan olgach, alohida "picked_up" bosqichisiz to'g'ridan-to'g'ri
///    "brought_in"ga o'tadi (bu oraliq bosqich qo'shimcha ish talab qilgani
///    uchun olib tashlangan; "picked_up" qiymati faqat eski buyurtmalar
///    tarixi uchun konfiguratsiyada qolgan). "brought_in" bosqichida har
///    bir ITEM mustaqil ravishda o'zining pipeline'i bo'ylab ishlov
///    olinadi — pastdagi kItemPipeline'ga qarang.
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
    label: 'Qabul qilindi',
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
  'pending': StatusInfo(
    label: 'Kutilmoqda',
    icon: Icons.hourglass_empty_rounded,
    color: AppColors.grayDark,
    background: Color(0xFFF1EFF3),
  ),
  'returned': StatusInfo(
    label: 'Qaytarilgan',
    icon: Icons.replay_rounded,
    color: AppColors.danger,
    background: Color(0xFFFCEAEA),
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


/// Har bir xizmat turi uchun order-level status ketma-ketligi — sotuv
/// menejeri progress-checklist'ida "bajarilgan / qolgan" ko'rsatish uchun.
/// Pickup uchun bu faqat item'lar mavjud bo'lishidan OLDINGI bosqichlar —
/// undan keyingi jarayon kItemPipeline bo'yicha, item-darajasida.
const Map<String, List<String>> kServicePipeline = {
  'pickup': ['new', 'picked_up', 'brought_in', 'done'],
  'onsite': ['new', 'team_assigned', 'in_progress', 'done'],
};

/// Pickup buyurtmadagi HAR BIR item shu pipeline bo'ylab mustaqil ishlov
/// olinadi. "packing"dan "returned"ga (sifat nazoratida rad etilganda) va
/// "returned"dan "washing"ga ("Yuvishni boshlash" bilan) — chiziqli emas,
/// server/src/lib/pipeline.ts'dagi isValidItemTransition bilan bir xil.
const List<String> kItemPipeline = ['pending', 'washing', 'packing', 'ready', 'done'];

/// server/src/lib/pipeline.ts'dagi TARIFF_COLOR_THRESHOLDS bilan bir xil —
/// har bir tarif uchun aniq kun bo'linishi (yashil/sariq/qizil).
const Map<String, ({int green, int yellow})> kTariffColorThresholds = {
  'express': (green: 2, yellow: 3),
  'comfort': (green: 3, yellow: 5),
  'premium': (green: 2, yellow: 3),
  'standart': (green: 4, yellow: 8),
};

enum ColorStage { green, yellow, red }

/// `dueDate` yoki item qo'shilgan sanadan kelib chiqib rang bosqichini
/// hisoblaydi. `addedAt` — item qo'shilgan vaqt (elapsedDays shundan
/// hisoblanadi).
ColorStage colorStageFor(String? tariff, DateTime addedAt) {
  final t = kTariffColorThresholds[tariff] ?? kTariffColorThresholds['standart']!;
  final elapsedDays = DateTime.now().difference(addedAt).inDays;
  if (elapsedDays < t.green) return ColorStage.green;
  if (elapsedDays < t.yellow) return ColorStage.yellow;
  return ColorStage.red;
}

const Map<ColorStage, Color> kColorStageColors = {
  ColorStage.green: AppColors.success,
  ColorStage.yellow: AppColors.warning,
  ColorStage.red: AppColors.danger,
};

/// Buyurtma "Manba"si (talab: marketing statistikasi) — sotuv menejeri
/// buyurtma yaratishda ixtiyoriy ravishda tanlaydi. server/src/lib/
/// orderSources.ts va admin_web/src/lib/order-sources.ts bilan bir xil
/// kalitlar.
const Map<String, String> kOrderSourceConfig = {
  'instagram': 'Instagram',
  'telegram': 'Telegram',
  'referral': 'Tanish orqali',
  'car_branding': 'Mashina brandi',
  'ad_banner': 'Reklama banneri',
};

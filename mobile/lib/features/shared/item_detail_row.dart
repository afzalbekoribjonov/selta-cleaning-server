import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order_item.dart';

const _conditionLabels = {
  'average': "O'rtacha",
  'bad': 'Yomon',
  'veryBad': 'Juda yomon',
};

/// Mahsulotning o'lchov/miqdor tafsilotini hisoblash turiga qarab
/// o'qiladigan matnga aylantiradi.
String itemMeasurementLabel(OrderItem item) {
  switch (item.calcType) {
    case 'sqm':
      final qty = item.qty?.toStringAsFixed(2) ?? '0';
      if (item.width != null && item.height != null) {
        return '$qty m² (${item.width}×${item.height})';
      }
      return '$qty m²';
    case 'meter':
      return '${item.qty?.toStringAsFixed(1) ?? '0'} metr';
    case 'kg':
      return '${item.qty?.toStringAsFixed(1) ?? '0'} kg';
    case 'count':
      return '${item.qty?.toStringAsFixed(0) ?? '0'} dona';
    case 'size':
      return item.sizeVariant == 'large' ? 'Katta' : 'Kichik';
    default:
      return '';
  }
}

/// Har bir buyurtma buyum(item) qatori — sub-ID, nomi, o'lchov/miqdor,
/// mahsulot holati (agar belgilangan bo'lsa — ustama foizi bilan), narx,
/// va QC rad etilgan bo'lsa sababi. Ishchi, Dastavchik, Jamoa va
/// Dispetcher ekranlarida bir xil ko'rinishda ishlatiladi.
class ItemDetailRow extends StatelessWidget {
  final OrderItem item;
  final String subId;
  final bool editable;
  final VoidCallback? onTap;

  const ItemDetailRow({
    super.key,
    required this.item,
    required this.subId,
    this.editable = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final failed = item.qcStatus == 'failed';
    final measurement = itemMeasurementLabel(item);
    final conditionLabel = _conditionLabels[item.condition];
    // Talab #8: har bir tarif uchun kun-asosidagi rang bosqichi — faqat
    // hali yakunlanmagan pickup itemlarida ko'rsatiladi.
    final showColorDot = item.status != null && !item.isDone && item.tariff != null && item.createdAt != null;
    final colorStage = showColorDot ? colorStageFor(item.tariff, item.createdAt!) : null;

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (colorStage != null) ...[
                  Container(
                    margin: const EdgeInsets.only(top: 4, right: 6),
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(color: kColorStageColors[colorStage], shape: BoxShape.circle),
                  ),
                ],
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: Text(subId, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 11.5)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: item.isDone ? AppColors.success : AppColors.ink,
                          decoration: item.isDone ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      if (measurement.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 1),
                          child: Text(measurement, style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark)),
                        ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text("${item.price.toStringAsFixed(0)} so'm", style: const TextStyle(color: AppColors.grayDark, fontSize: 12, fontWeight: FontWeight.w600)),
                    if (conditionLabel != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
                          child: Text(
                            item.conditionSurchargePercent != null && item.conditionSurchargePercent! > 0
                                ? '$conditionLabel +${item.conditionSurchargePercent!.toStringAsFixed(0)}%'
                                : conditionLabel,
                            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.warning),
                          ),
                        ),
                      ),
                  ],
                ),
                if (editable) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.edit_rounded, size: 14, color: AppColors.gray),
                ],
                if (failed) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.error_rounded, color: AppColors.danger, size: 16),
                ],
              ],
            ),
            // Talab: har bir mahsulotning tarifi va qaysi jarayonda
            // ekanligi aniq ko'rinib turishi kerak — faqat pickup
            // itemlarida mavjud (onsite itemlarida tariff/status yo'q).
            if (item.tariff != null || item.status != null)
              Padding(
                padding: const EdgeInsets.only(left: 8, top: 4),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (item.tariff != null)
                      _Badge(
                        label: kTariffConfig[item.tariff]?.label ?? item.tariff!,
                        color: kTariffConfig[item.tariff]?.color ?? AppColors.grayDark,
                        background: kTariffConfig[item.tariff]?.background ?? AppColors.bg,
                      ),
                    if (item.status != null)
                      _Badge(
                        label: kStatusConfig[item.status]?.label ?? item.status!,
                        color: kStatusConfig[item.status]?.color ?? AppColors.grayDark,
                        background: kStatusConfig[item.status]?.background ?? AppColors.bg,
                      ),
                  ],
                ),
              ),
            if (failed)
              Padding(
                padding: const EdgeInsets.only(left: 8, top: 3),
                child: Text(
                  item.qcNote?.isNotEmpty == true ? "Sifat nazorati rad etdi: ${item.qcNote}" : "Sifat nazorati rad etdi — qayta ishlov kerak",
                  style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            // Talab: qaysi dastavchik yetkazgani ko'rinib turishi kerak.
            if (item.isDone && item.deliveredByName != null)
              Padding(
                padding: const EdgeInsets.only(left: 8, top: 3),
                child: Text(
                  'Yetkazdi: ${item.deliveredByName}',
                  style: const TextStyle(color: AppColors.grayDark, fontSize: 11.5, fontWeight: FontWeight.w600),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  final Color background;
  const _Badge({required this.label, required this.color, required this.background});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

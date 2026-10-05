import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order_item.dart';
import '../../core/services/tariff_settings.dart';
import '../../core/utils/money_utils.dart';

const _conditionLabels = {
  'average': "O'rtacha",
  'bad': 'Yomon',
  'veryBad': 'Juda yomon',
};

/// "3" / "3.5" / "10.55" — keraksiz nollarsiz (o'lcham "3.0×4.0" emas "3×4").
String _dimension(num value) {
  final fixed = value.toStringAsFixed(2);
  return fixed.contains('.') ? fixed.replaceFirst(RegExp(r'\.?0+$'), '') : fixed;
}

/// Mahsulotning o'lchov/miqdor tafsilotini hisoblash turiga qarab
/// o'qiladigan matnga aylantiradi.
String itemMeasurementLabel(OrderItem item) {
  switch (item.calcType) {
    case 'sqm':
      final qty = item.qty?.toStringAsFixed(2) ?? '0';
      if (item.width != null && item.height != null) {
        return '$qty m² (${_dimension(item.width!)}×${_dimension(item.height!)})';
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
class ItemDetailRow extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
    final failed = item.qcStatus == 'failed';
    final measurement = itemMeasurementLabel(item);
    final conditionLabel = _conditionLabels[item.condition];
    // Talab #8: har bir tarif uchun kun-asosidagi rang bosqichi — faqat
    // hali yakunlanmagan pickup itemlarida ko'rsatiladi.
    final showColorDot = item.status != null && !item.isDone && item.tariff != null && item.createdAt != null;
    final colorStage = showColorDot ? colorStageFor(item.tariff, item.createdAt!, ref.tariffs) : null;
    // Talab: o'lchanmagan mahsulot KARTASI butunlay qizarib tursin — u
    // yuvishga ham, upakovkaga ham o'ta olmaydi, shuning uchun ro'yxatda
    // birinchi bo'lib ko'zga tashlanishi kerak.
    final unmeasured = item.price <= 0 && !item.isDone;

    // Holat belgilari: tarif, jarayon, mahsulot holati (ustama bilan) va
    // "o'lchanmagan". Ular nom yonida emas, alohida qatorda — tor ekranda
    // nom ustuni siqilib, harflar ustunga tushib qolmasligi uchun.
    final badges = <Widget>[
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
      if (conditionLabel != null)
        _Badge(
          label: item.conditionSurchargePercent != null && item.conditionSurchargePercent! > 0
              ? '$conditionLabel +${item.conditionSurchargePercent!.toStringAsFixed(0)}%'
              : conditionLabel,
          color: AppColors.warning,
          background: AppColors.warning.withValues(alpha: 0.12),
        ),
      // Talab: narxi 0 bo'lgan (hali o'lchanmagan) mahsulot qizarib, darhol
      // ko'zga tashlanib tursin — u yuvishga ham, upakovkaga ham o'tolmaydi.
      if (unmeasured)
        _Badge(
          label: "O'lchanmagan — avval o'lchang",
          color: AppColors.danger,
          background: AppColors.danger.withValues(alpha: 0.12),
        ),
    ];

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        decoration: unmeasured
            ? BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
              )
            : null,
        padding: unmeasured ? const EdgeInsets.fromLTRB(8, 7, 8, 7) : const EdgeInsets.symmetric(vertical: 7),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1-qator: rangli nuqta, sub-ID va nom (+ tahrir belgisi).
            // 2-qator: o'lcham va narx. Avval hammasi bitta qatorda edi va
            // tor ekran/katta shriftda nom ustuni siqilib, qator toshardi.
            LayoutBuilder(
              builder: (context, constraints) => Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (colorStage != null)
                    Container(
                      margin: const EdgeInsets.only(top: 4, right: 6),
                      width: 9,
                      height: 9,
                      decoration: BoxDecoration(color: kColorStageColors[colorStage], shape: BoxShape.circle),
                    ),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.32),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          subId,
                          style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 11.5),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      item.name,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: item.isDone ? AppColors.success : AppColors.ink,
                        decoration: item.isDone ? TextDecoration.lineThrough : null,
                      ),
                    ),
                  ),
                  if (editable) ...[
                    const SizedBox(width: 6),
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(Icons.edit_rounded, size: 14, color: AppColors.gray),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: LayoutBuilder(
                builder: (context, constraints) => Row(
                  children: [
                    if (failed) ...[
                      const Icon(Icons.error_rounded, color: AppColors.danger, size: 15),
                      const SizedBox(width: 4),
                    ],
                    Expanded(
                      child: Text(
                        measurement,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Narx yarim endan oshmaydi — katta summa o'zi kichrayadi.
                    ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.5),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerRight,
                        child: Text(
                          formatMoneyUz(item.price),
                          style: TextStyle(
                            color: unmeasured ? AppColors.danger : AppColors.ink,
                            fontSize: 12.5,
                            fontWeight: unmeasured ? FontWeight.w900 : FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (badges.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 8, top: 4),
                child: Wrap(spacing: 6, runSpacing: 4, children: badges),
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
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
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

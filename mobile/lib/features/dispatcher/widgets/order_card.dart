import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../../core/constants.dart';
import '../../../core/models/order.dart';
import '../../../core/services/order_items_provider.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/utils/money_utils.dart';

/// Buyurtma kartasi — status bo'yicha chap chiziq, tarif rangli belgi,
/// muddati o'tgan buyurtmalar qizil bilan ajratiladi (talab: "kechikayotgan
/// buyurtmalar qizil bo'lib... ko'rinib turishi shart"). Buyurtma summasi
/// har doim ko'rinadi; `emphasizePrice` bilan (masalan Dastavchik "tayyor"
/// bosqichida — mijozdan pul yig'ish kerak bo'lganda) katta va yorqinroq
/// ko'rsatiladi.
class OrderCard extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;
  final List<Widget>? actions;
  final bool emphasizePrice;

  const OrderCard({
    super.key,
    required this.order,
    required this.onTap,
    this.actions,
    this.emphasizePrice = false,
  });

  @override
  Widget build(BuildContext context) {
    final status = statusOf(order.status);
    // Pickup buyurtmalarda tarif endi item-darajasida — order.tariff faqat
    // onsite uchun mavjud, shuning uchun pill faqat shunda ko'rsatiladi.
    final tariff = order.tariff != null ? tariffOf(order.tariff) : null;

    // Talab: kartada mahsulotning eng yaqin topshirish sanasi va necha kun
    // qolgani ko'rinsin. Qiymat buyurtmaning o'zidan o'qiladi — karta
    // endi mahsulotlarga obuna BO'LMAYDI (o'qishlarni tejash uchun).
    final dueDate = effectiveDueDate(order);
    final overdue = dueDate != null && !order.isDone && DateTime.now().isAfter(dueDate);

    // Talab: jamoa biriktirilmagan joyida-yuvish buyurtmasi e'tiborni
    // tortib turishi kerak.
    final needsTeam = order.serviceType == 'onsite' && order.status == 'new' && order.assignedTeam.isEmpty;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: needsTeam
                  ? AppColors.danger
                  : overdue
                      ? AppColors.danger.withValues(alpha: 0.4)
                      : AppColors.border,
              width: needsTeam ? 1.5 : 1,
            ),
            boxShadow: [
              BoxShadow(color: AppColors.ink.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 3)),
            ],
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 6,
                  decoration: BoxDecoration(
                    color: status.color,
                    borderRadius: const BorderRadius.horizontal(left: Radius.circular(20)),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              '#${order.orderNumber}',
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.ink),
                            ),
                            if (tariff != null) ...[
                              const SizedBox(width: 8),
                              _Pill(label: tariff.label, color: tariff.color, background: tariff.background),
                            ],
                            const Spacer(),
                            _Pill(label: status.label, color: status.color, background: status.background, icon: status.icon),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(Icons.phone_rounded, size: 14, color: AppColors.gray),
                            const SizedBox(width: 5),
                            Text(order.phone, style: const TextStyle(color: AppColors.grayDark, fontSize: 13)),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            const Icon(Icons.location_on_rounded, size: 14, color: AppColors.gray),
                            const SizedBox(width: 5),
                            Expanded(
                              child: Text(
                                order.location,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: AppColors.grayDark, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                        if (needsTeam) ...[
                          const SizedBox(height: 8),
                          _TeamAlertBanner(),
                        ],
                        if (dueDate != null) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(
                                overdue ? Icons.warning_rounded : Icons.event_rounded,
                                size: 14,
                                color: overdue ? AppColors.danger : AppColors.gray,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                formatDateUz(dueDate),
                                style: TextStyle(
                                  color: overdue ? AppColors.danger : AppColors.gray,
                                  fontSize: 12,
                                  fontWeight: overdue ? FontWeight.w800 : FontWeight.w500,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                decoration: BoxDecoration(
                                  color: overdue
                                      ? AppColors.danger.withValues(alpha: 0.12)
                                      : daysUntil(dueDate) <= 1
                                          ? AppColors.warning.withValues(alpha: 0.15)
                                          : AppColors.success.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  dueLabelUz(dueDate),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: overdue
                                        ? AppColors.danger
                                        : daysUntil(dueDate) <= 1
                                            ? AppColors.warning
                                            : AppColors.success,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (emphasizePrice) ...[
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                            decoration: BoxDecoration(
                              color: AppColors.success.withValues(alpha: 0.09),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.payments_rounded, size: 17, color: AppColors.success),
                                const SizedBox(width: 7),
                                const Text(
                                  "Yig'ish kerak",
                                  style: TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                                ),
                                const Spacer(),
                                Text(
                                  formatMoneyUz(order.totalPrice),
                                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.success),
                                ),
                              ],
                            ),
                          ),
                        ] else ...[
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              const Icon(Icons.payments_rounded, size: 14, color: AppColors.gray),
                              const SizedBox(width: 5),
                              Text(
                                formatMoneyUz(order.totalPrice),
                                style: const TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w800),
                              ),
                            ],
                          ),
                        ],
                        if (actions != null && actions!.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Row(children: [for (final a in actions!) ...[a, const SizedBox(width: 8)]]),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Jamoa biriktirilmagan joyida-yuvish buyurtmasi uchun ogohlantirish —
/// talab: "qandaydir qizarib danger holatda yonib o'chadigan" bo'lsin.
/// Nafas olayotgandek silliq o'zgaradi (keskin miltillash emas) — uzoq
/// tikilib turadigan ro'yxatda charchatmasligi uchun.
class _TeamAlertBanner extends StatefulWidget {
  @override
  State<_TeamAlertBanner> createState() => _TeamAlertBannerState();
}

class _TeamAlertBannerState extends State<_TeamAlertBanner> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.danger.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.groups_rounded, size: 14, color: AppColors.danger),
            SizedBox(width: 6),
            Text(
              'Jamoa biriktirilmagan',
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.danger),
            ),
          ],
        ),
      ),
    );
  }
}

/// Buyurtma kartasidagi harakat tugmasi — "Qo'ng'iroq"/"Yo'lga chiqish"
/// kabi (talab: Selta brend ranglariga mos, professional ko'rinish).
class CardActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool filled;

  const CardActionButton({super.key, required this.icon, required this.label, required this.onTap, this.filled = false});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: filled ? AppColors.primary : AppColors.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 15, color: filled ? Colors.white : AppColors.primary),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: filled ? Colors.white : AppColors.primary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color color;
  final Color background;
  final IconData? icon;

  const _Pill({required this.label, required this.color, required this.background, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 11, color: color), const SizedBox(width: 3)],
          Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

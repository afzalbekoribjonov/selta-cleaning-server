import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../../core/constants.dart';
import '../../../core/models/order.dart';
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
    final overdue = order.isOverdue;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: overdue ? AppColors.danger.withValues(alpha: 0.4) : AppColors.border),
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
                        if (order.dueDate != null) ...[
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
                                overdue
                                    ? "Muddati o'tgan — ${formatDateUz(order.dueDate!)}"
                                    : formatDateUz(order.dueDate!),
                                style: TextStyle(
                                  color: overdue ? AppColors.danger : AppColors.gray,
                                  fontSize: 12,
                                  fontWeight: overdue ? FontWeight.w800 : FontWeight.w500,
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

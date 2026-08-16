import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../../core/constants.dart';
import '../../../core/models/order.dart';
import '../../../core/utils/date_utils.dart';

/// Buyurtma kartasi — status bo'yicha chap chiziq, tarif rangli belgi,
/// muddati o'tgan buyurtmalar qizil bilan ajratiladi (talab: "kechikayotgan
/// buyurtmalar qizil bo'lib... ko'rinib turishi shart").
class OrderCard extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;

  const OrderCard({super.key, required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = statusOf(order.status);
    final tariff = tariffOf(order.tariff);
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
                            const SizedBox(width: 8),
                            _Pill(label: tariff.label, color: tariff.color, background: tariff.background),
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

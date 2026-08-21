import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';

/// Sotuv menejeri onsite buyurtma yaratishda ixtiyoriy ravishda yozgan
/// mahsulot nomlari va taxminiy summa — jamoa uchun faqat ma'lumot
/// (haqiqiy mahsulotlar mijoz uyida aniqlashtirilib qo'shiladi). Sotuv
/// menejeri va jamoa ekranlarida bir xil ko'rinishda ishlatiladi.
class SalesManagerNotesCard extends StatelessWidget {
  final Order order;
  const SalesManagerNotesCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.sticky_note_2_rounded, size: 16, color: AppColors.ink),
              const SizedBox(width: 6),
              const Text('Sotuv menejeri qaydlari', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
            ],
          ),
          if (order.notedItems.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (var i = 0; i < order.notedItems.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text('${i + 1}. ${order.notedItems[i]}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
          ],
          if (order.estimatedPrice != null) ...[
            const SizedBox(height: 8),
            Text(
              "Taxminiy summa: ${order.estimatedPrice!.toStringAsFixed(0)} so'm",
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.primary),
            ),
          ],
        ],
      ),
    );
  }
}

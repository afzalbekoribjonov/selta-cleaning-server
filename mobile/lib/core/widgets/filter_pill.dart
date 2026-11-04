import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Gorizontal filtr/saralash "tabletkasi" — ilova bo'ylab bir xil ko'rinish.
///
/// Material `ChoiceChip` o'rniga: u yorlig'ini ichki cheklov bilan
/// o'lchaydi va tor ekran yoki katta shriftda matn kesilib ("Barcha|",
/// "Sar") qolardi. Bu esa matn kengligiga to'liq moslashadi.
class FilterPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// Yorliq yonidagi son (masalan "Hammasi 12").
  final int? count;

  /// Tanlangan holat rangi.
  final Color color;

  /// Yorliq oldida kichik aylanuvchi belgi (masalan joylashuv aniqlanmoqda).
  final bool busy;

  /// Yorliq oldidagi belgi (ixtiyoriy).
  final IconData? icon;

  const FilterPill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.count,
    this.color = AppColors.primary,
    this.busy = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final fg = selected ? Colors.white : AppColors.ink;
    return Material(
      color: selected ? color : AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 36),
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? color : AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (busy) ...[
                SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: fg)),
                const SizedBox(width: 7),
              ],
              if (icon != null && !busy) ...[
                Icon(icon, size: 15, color: selected ? Colors.white : AppColors.grayDark),
                const SizedBox(width: 6),
              ],
              Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: fg, height: 1.2)),
              if (count != null) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: selected ? Colors.white.withValues(alpha: 0.22) : color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: selected ? Colors.white : color, height: 1.25),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// [FilterPill]lar uchun gorizontal aylanadigan qator.
class FilterPillBar extends StatelessWidget {
  final List<Widget> children;
  final EdgeInsets padding;

  const FilterPillBar({super.key, required this.children, this.padding = const EdgeInsets.fromLTRB(16, 6, 16, 6)});

  @override
  Widget build(BuildContext context) {
    // To'liq kenglik: qisqa qator Column ichida markazga surilib qolmasin.
    return SizedBox(
      width: double.infinity,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: padding,
        child: Row(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

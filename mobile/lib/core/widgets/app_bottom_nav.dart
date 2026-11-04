import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Pastki menyuning bitta bandi.
class AppNavItem {
  final String label;
  final IconData icon;
  final IconData activeIcon;

  /// Belgidagi son (0 — ko'rsatilmaydi).
  final int count;

  const AppNavItem({required this.label, required this.icon, IconData? activeIcon, this.count = 0})
      : activeIcon = activeIcon ?? icon;
}

/// Barcha bo'lim panellarining bir xil pastki menyusi.
///
/// Avval standart NavigationBar edi: uzun nom tor ekranda qisqarib
/// ("Deyarli t…") qolar, son belgisi belgining ustiga chiqib turar va
/// bandlar tartibsiz ko'rinardi. Endi: teng kenglikdagi bandlar, faol band
/// ustida yumshoq "tabletka", son esa belgining burchagida ixcham.
class AppBottomNav extends StatelessWidget {
  final List<AppNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelect;

  const AppBottomNav({super.key, required this.items, required this.currentIndex, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _NavButton(
                    item: items[i],
                    selected: i == currentIndex,
                    onTap: () => onSelect(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  final AppNavItem item;
  final bool selected;
  final VoidCallback onTap;

  const _NavButton({required this.item, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.primary : AppColors.grayDark;
    final count = item.count;
    return Semantics(
      selected: selected,
      button: true,
      label: count > 0 ? '${item.label}, $count ta' : item.label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    curve: Curves.easeOut,
                    width: 56,
                    height: 32,
                    decoration: BoxDecoration(
                      color: selected ? AppColors.primary.withValues(alpha: 0.12) : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(selected ? item.activeIcon : item.icon, size: 23, color: color),
                  ),
                  if (count > 0)
                    Positioned(
                      top: -3,
                      right: 2,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 18),
                        height: 18,
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: selected ? AppColors.primary : AppColors.danger,
                          borderRadius: BorderRadius.circular(9),
                          border: Border.all(color: AppColors.surface, width: 1.5),
                        ),
                        child: Text(
                          count > 99 ? '99+' : '$count',
                          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900, height: 1.1),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  item.label,
                  maxLines: 1,
                  style: TextStyle(fontSize: 12, fontWeight: selected ? FontWeight.w800 : FontWeight.w600, color: color),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

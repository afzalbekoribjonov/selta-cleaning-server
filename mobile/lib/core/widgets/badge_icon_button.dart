import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Sarlavhadagi belgi + o'ng yuqori burchakda qizil son (0 bo'lsa son yo'q).
/// Masalan dastavchikning "Topshiriqlar" va "Joyida yuvish" bo'limlari.
class BadgeIconButton extends StatelessWidget {
  final IconData icon;
  final int count;
  final String tooltip;
  final VoidCallback onPressed;
  final Color color;

  const BadgeIconButton({
    super.key,
    required this.icon,
    required this.count,
    required this.tooltip,
    required this.onPressed,
    this.color = AppColors.ink,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: count > 0 ? '$tooltip — $count ta' : tooltip,
      child: InkResponse(
        onTap: onPressed,
        radius: 22,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Icon(icon, color: color, size: 24),
              if (count > 0)
                Positioned(
                  top: 3,
                  right: 1,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(color: Colors.white, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      count > 99 ? '99+' : '$count',
                      style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w900, height: 1.1),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

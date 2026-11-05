import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/utils/date_utils.dart';

/// "Bugun" / "Kecha" / "Dushanba, 3-noyabr".
String dayLabelUz(DateTime day) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final d = DateTime(day.year, day.month, day.day);
  final diff = today.difference(d).inDays;
  if (diff == 0) return 'Bugun';
  if (diff == 1) return 'Kecha';
  if (diff == -1) return 'Ertaga';
  return formatWeekdayDateUz(d);
}

/// Kunni tanlash: ‹ Bugun › — o'rtasi bosilsa kalendar. Kelajak kunlar
/// yopiq (xodimlarning ishi hali bo'lmagan).
class DayNavigator extends StatelessWidget {
  final DateTime day;
  final ValueChanged<DateTime> onChanged;

  const DayNavigator({super.key, required this.day, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final current = DateTime(day.year, day.month, day.day);
    final isToday = !current.isBefore(today);
    final label = dayLabelUz(current);

    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Oldingi kun',
            onPressed: () => onChanged(current.subtract(const Duration(days: 1))),
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: current,
                  firstDate: today.subtract(const Duration(days: 365)),
                  lastDate: today,
                  helpText: 'Kunni tanlang',
                  cancelText: 'Bekor',
                  confirmText: 'Tanlash',
                );
                if (picked != null) onChanged(picked);
              },
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.calendar_month_rounded, size: 17, color: AppColors.primary),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      label == 'Bugun' || label == 'Kecha' ? '$label · ${formatDateUz(current)}' : label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink),
                    ),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Keyingi kun',
            onPressed: isToday ? null : () => onChanged(current.add(const Duration(days: 1))),
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

/// Bo'lim sarlavhasi (o'ngida ixtiyoriy amal).
class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const SectionHeader({super.key, required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark)),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Kichik rangli yorliq: "Yuvdi 5", "Kechikdi 09:40".
class InfoChip extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;

  const InfoChip({super.key, required this.text, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(9)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bugungi kun kaliti.
String todayKey() => dateKeyOf(DateTime.now());

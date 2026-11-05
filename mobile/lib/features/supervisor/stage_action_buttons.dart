import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../shared/catalog_item_sheet.dart';
import 'performer_picker_sheet.dart';
import 'supervisor_workflow.dart';

/// Mahsulot bosqichiga mos amallar — har biri "kim bajardi?" oynasini
/// ochadi. Narxi yo'q (o'lchanmagan) mahsulotni yuvishga berib bo'lmaydi
/// (server ham rad etadi) — uning o'rniga "O'lchash".
class StageActionButtons extends StatelessWidget {
  final WorkItem work;
  const StageActionButtons({super.key, required this.work});

  @override
  Widget build(BuildContext context) {
    final item = work.item;
    final actions = kStageActions[item.status] ?? const <StageAction>[];
    final unmeasured = item.price <= 0 && (item.status == 'pending' || item.status == 'washing');

    if (unmeasured) {
      return _ActionButton(
        label: "O'lchash",
        icon: Icons.straighten_rounded,
        color: AppColors.danger,
        filled: true,
        onTap: () => openCatalogItemSheet(context, work.order, existingItem: item),
      );
    }
    if (actions.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.end,
      children: [
        for (final a in actions)
          _ActionButton(
            label: a.label,
            icon: a.icon,
            color: a.destructive ? AppColors.danger : AppColors.primary,
            filled: !a.destructive,
            onTap: () async {
              final saved = await openPerformerPicker(context, work: work, action: a);
              if (saved && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('${work.subId} — ${a.label.toLowerCase()} qayd etildi'), duration: const Duration(seconds: 2)),
                );
              }
            },
          ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool filled;
  final VoidCallback onTap;

  const _ActionButton({required this.label, required this.icon, required this.color, required this.filled, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final style = filled
        ? FilledButton.styleFrom(
            backgroundColor: color,
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          )
        : OutlinedButton.styleFrom(
            foregroundColor: color,
            side: BorderSide(color: color.withValues(alpha: 0.6)),
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          );
    return filled
        ? FilledButton.icon(onPressed: onTap, style: style, icon: Icon(icon, size: 17), label: Text(label))
        : OutlinedButton.icon(onPressed: onTap, style: style, icon: Icon(icon, size: 17), label: Text(label));
  }
}

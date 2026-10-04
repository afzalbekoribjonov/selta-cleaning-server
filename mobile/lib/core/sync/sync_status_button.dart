import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../services/connectivity_service.dart';
import '../utils/date_utils.dart';
import 'action_queue.dart';
import 'pending_action.dart';

/// Sinxronlash holati — xodim panelining yuqori qismida.
///
/// Hammasi joyida bo'lsa (internet bor, navbat bo'sh) umuman ko'rinmaydi:
/// ilova oflayn ham bir xil ishlaydi, shuning uchun xodimni behuda
/// bezovta qilmaymiz. Ko'rinadi faqat:
///  - internet yo'q        -> kulrang "bulut o'chiq";
///  - navbatda amal bor   -> yuborilayotgan amallar soni;
///  - server rad etgan    -> qizil, xodim qarori kerak.
class SyncStatusButton extends ConsumerWidget {
  const SyncStatusButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final pending = ref.watch(pendingActionCountProvider);
    final failed = ref.watch(failedActionsProvider).length;
    if (online && pending == 0 && failed == 0) return const SizedBox.shrink();

    final (IconData icon, Color color, int count, String tooltip) = failed > 0
        ? (Icons.sync_problem_rounded, AppColors.danger, failed, 'Bajarilmagan amallar')
        : !online
            ? (Icons.cloud_off_rounded, AppColors.grayDark, pending, 'Internet yo\'q')
            : (Icons.cloud_upload_rounded, AppColors.primary, pending, 'Yuborilmoqda');

    final button = IconButton(
      onPressed: () => showSyncSheet(context),
      tooltip: tooltip,
      style: IconButton.styleFrom(backgroundColor: color.withValues(alpha: 0.1)),
      icon: Icon(icon, color: color, size: 20),
    );
    if (count == 0) return button;
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      backgroundColor: failed > 0 ? AppColors.danger : color,
      offset: const Offset(-4, 4),
      child: button,
    );
  }
}

Future<void> showSyncSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _SyncSheet(),
  );
}

class _SyncSheet extends ConsumerWidget {
  const _SyncSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final actions = ref.watch(actionQueueProvider);
    final failed = actions.where((a) => a.failed).toList();
    final waiting = actions.where((a) => !a.failed && !a.acked).toList();

    final status = !online
        ? "Internet yo'q. O'zgarishlar telefonda saqlangan va ulanish tiklanishi bilan avtomatik yuboriladi."
        : waiting.isNotEmpty
            ? 'Serverga yuborilmoqda…'
            : failed.isNotEmpty
                ? "Quyidagi amallarni server qabul qilmadi. Qayta urinib ko'ring yoki bekor qiling."
                : 'Hammasi saqlandi.';

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      maxChildSize: 0.9,
      builder: (context, controller) => Container(
        decoration: const BoxDecoration(
          color: AppColors.bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Sinxronlash',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.ink),
            ),
            const SizedBox(height: 6),
            Text(status, style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.grayDark)),
            if (failed.isNotEmpty) ...[
              const SizedBox(height: 18),
              const _SectionTitle('Bajarilmadi'),
              for (final a in failed) _ActionTile(action: a),
            ],
            if (waiting.isNotEmpty) ...[
              const SizedBox(height: 18),
              _SectionTitle('Navbatda · ${waiting.length}'),
              for (final a in waiting) _ActionTile(action: a),
            ],
            if (failed.isEmpty && waiting.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Icon(Icons.cloud_done_rounded, size: 44, color: AppColors.success),
              ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.grayDark)),
      );
}

class _ActionTile extends ConsumerWidget {
  final PendingAction action;
  const _ActionTile({required this.action});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.read(actionQueueProvider.notifier);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: action.failed ? AppColors.danger.withValues(alpha: 0.35) : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                action.failed ? Icons.error_outline_rounded : Icons.schedule_rounded,
                size: 16,
                color: action.failed ? AppColors.danger : AppColors.gray,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  action.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
              ),
              const SizedBox(width: 8),
              Text(formatTimeHm(action.createdAt), style: const TextStyle(fontSize: 11.5, color: AppColors.gray)),
            ],
          ),
          if (action.failed) ...[
            if (action.error != null) ...[
              const SizedBox(height: 6),
              Text(action.error!, style: const TextStyle(fontSize: 12.5, color: AppColors.danger, height: 1.35)),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _confirmDiscard(context, queue),
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                    child: const Text('Bekor qilish'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: () => queue.retry(action.id),
                    child: const Text('Qayta urinish'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmDiscard(BuildContext context, ActionQueue queue) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Amalni bekor qilasizmi?'),
        content: const Text("Bu o'zgarish serverga yuborilmaydi va ekrandan olib tashlanadi."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Yo'q")),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Bekor qilish')),
        ],
      ),
    );
    if (ok == true) queue.discard(action.id);
  }
}

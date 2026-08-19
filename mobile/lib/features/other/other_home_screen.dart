import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/task.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/tasks_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../shared/employee_app_bar.dart';

/// "Boshqa" (4 ta doimiy bo'limga kirmaydigan) xodimlar uchun bosh ekran —
/// bo'lim panellari o'rniga admin tayinlagan topshiriqlar ro'yxati
/// ko'rsatiladi (talab #3/#5).
class OtherHomeScreen extends ConsumerWidget {
  const OtherHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final claims = ref.watch(employeeClaimsProvider).value;
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final departmentLabel =
        (employeeAsync.value?['departmentLabel'] as String?) ?? (employeeAsync.value?['department'] as String?) ?? '';

    if (claims == null) {
      return Scaffold(
        appBar: EmployeeAppBar(departmentLabel: departmentLabel, employeeName: fullName),
        body: const SeltaLoadingView(),
      );
    }

    final tasksAsync = ref.watch(myTasksProvider(claims.employeeId));

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: departmentLabel, employeeName: fullName),
      body: tasksAsync.when(
        loading: () => const SeltaLoadingView(),
        error: (err, _) => Center(child: Text(describeApiError(err))),
        data: (tasks) {
          final singleTasks = tasks.where((t) => t.isSingle).toList()
            ..sort((a, b) {
              if (a.isPending != b.isPending) return a.isPending ? -1 : 1;
              final ad = a.dueDate ?? DateTime(2100);
              final bd = b.dueDate ?? DateTime(2100);
              return ad.compareTo(bd);
            });
          final monthlyTasks = tasks.where((t) => !t.isSingle).toList()
            ..sort((a, b) => (a.scheduledDate ?? a.createdAt).compareTo(b.scheduledDate ?? b.createdAt));

          if (singleTasks.isEmpty && monthlyTasks.isEmpty) {
            return const _EmptyTasksState();
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              if (singleTasks.isNotEmpty) ...[
                const _SectionTitle(icon: Icons.assignment_rounded, label: 'Vazifalar'),
                const SizedBox(height: 10),
                for (final task in singleTasks) ...[
                  _SingleTaskCard(task: task),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 12),
              ],
              if (monthlyTasks.isNotEmpty) ...[
                const _SectionTitle(icon: Icons.calendar_month_rounded, label: 'Oylik topshiriqlar'),
                const SizedBox(height: 10),
                for (final entry in _groupByMonth(monthlyTasks).entries) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Text(
                      entry.key,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.grayDark),
                    ),
                  ),
                  for (final task in entry.value) ...[
                    _MonthlyTaskRow(task: task),
                    const SizedBox(height: 8),
                  ],
                ],
              ],
            ],
          );
        },
      ),
    );
  }

  Map<String, List<Task>> _groupByMonth(List<Task> tasks) {
    final grouped = <String, List<Task>>{};
    for (final t in tasks) {
      final key = t.scheduledDate != null ? formatMonthYearUz(t.scheduledDate!) : "Sanasiz";
      grouped.putIfAbsent(key, () => []).add(t);
    }
    return grouped;
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String label;
  const _SectionTitle({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
      ],
    );
  }
}

class _SingleTaskCard extends ConsumerStatefulWidget {
  final Task task;
  const _SingleTaskCard({required this.task});

  @override
  ConsumerState<_SingleTaskCard> createState() => _SingleTaskCardState();
}

class _SingleTaskCardState extends ConsumerState<_SingleTaskCard> {
  bool _submitting = false;

  Future<void> _markDone() async {
    setState(() => _submitting = true);
    try {
      await ref.read(tasksRepositoryProvider).markDone(widget.task.id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _markDelayed() async {
    final note = await showDialog<String>(
      context: context,
      builder: (context) => _DelayNoteDialog(),
    );
    if (note == null) return;
    setState(() => _submitting = true);
    try {
      await ref.read(tasksRepositoryProvider).markDelayed(widget.task.id, delayNote: note.isEmpty ? null : note);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final overdue = task.isOverdue;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: overdue ? AppColors.danger.withValues(alpha: 0.4) : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(task.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
              ),
              _StatusBadge(task: task),
            ],
          ),
          if (task.description?.isNotEmpty == true) ...[
            const SizedBox(height: 6),
            Text(task.description!, style: const TextStyle(fontSize: 13, color: AppColors.grayDark, height: 1.4)),
          ],
          if (task.dueDate != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.event_rounded, size: 15, color: overdue ? AppColors.danger : AppColors.grayDark),
                const SizedBox(width: 6),
                Text(
                  'Muddat: ${formatDateTimeUz(task.dueDate!)}',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: overdue ? AppColors.danger : AppColors.grayDark,
                  ),
                ),
              ],
            ),
          ],
          if (task.isDelayed && task.delayNote?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
              child: Text(task.delayNote!, style: const TextStyle(fontSize: 12.5, color: AppColors.ink)),
            ),
          ],
          if (task.isPending) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _submitting ? null : _markDelayed,
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.warning, side: const BorderSide(color: AppColors.warning)),
                    icon: const Icon(Icons.schedule_rounded, size: 16),
                    label: const Text('Kechikmoqdaman', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _submitting ? null : _markDone,
                    style: FilledButton.styleFrom(backgroundColor: AppColors.success),
                    icon: _submitting
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.check_rounded, size: 16),
                    label: const Text('Bajarildi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _MonthlyTaskRow extends ConsumerStatefulWidget {
  final Task task;
  const _MonthlyTaskRow({required this.task});

  @override
  ConsumerState<_MonthlyTaskRow> createState() => _MonthlyTaskRowState();
}

class _MonthlyTaskRowState extends ConsumerState<_MonthlyTaskRow> {
  bool _submitting = false;

  Future<void> _markDone() async {
    setState(() => _submitting = true);
    try {
      await ref.read(tasksRepositoryProvider).markDone(widget.task.id);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e))));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final done = task.isDone;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: done ? AppColors.success.withValues(alpha: 0.1) : AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              task.scheduledDate != null ? '${task.scheduledDate!.day}' : '?',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: done ? AppColors.success : AppColors.primary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              task.title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: done ? AppColors.grayDark : AppColors.ink,
                decoration: done ? TextDecoration.lineThrough : null,
              ),
            ),
          ),
          const SizedBox(width: 8),
          if (done)
            const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 22)
          else
            SizedBox(
              height: 32,
              child: OutlinedButton(
                onPressed: _submitting ? null : _markDone,
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 12)),
                child: _submitting
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Bajarildi', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final Task task;
  const _StatusBadge({required this.task});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (task.status) {
      'done' => ('Bajarildi', AppColors.success),
      'delayed' => ('Kechikmoqda', AppColors.warning),
      _ => (task.isOverdue ? 'Muddati o\'tdi' : 'Jarayonda', task.isOverdue ? AppColors.danger : AppColors.info),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _DelayNoteDialog extends StatefulWidget {
  @override
  State<_DelayNoteDialog> createState() => _DelayNoteDialogState();
}

class _DelayNoteDialogState extends State<_DelayNoteDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Kechikish sababi'),
      content: TextField(
        controller: _controller,
        maxLines: 3,
        decoration: const InputDecoration(hintText: 'Ixtiyoriy izoh yozing (ixtiyoriy)'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Bekor qilish')),
        FilledButton(onPressed: () => Navigator.pop(context, _controller.text.trim()), child: const Text('Tasdiqlash')),
      ],
    );
  }
}

class _EmptyTasksState extends StatelessWidget {
  const _EmptyTasksState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.task_alt_rounded, size: 48, color: AppColors.gray),
            const SizedBox(height: 12),
            const Text("Hozircha topshiriq yo'q", style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text(
              'Admin sizga topshiriq tayinlaganda shu yerda ko\'rinadi',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.grayDark, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

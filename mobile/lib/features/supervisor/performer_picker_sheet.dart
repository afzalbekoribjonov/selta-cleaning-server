import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/widgets/employee_avatar.dart';
import '../shared/item_detail_row.dart' show itemMeasurementLabel;
import 'supervisor_workflow.dart';

/// Nazoratchi bosqichni qayd etadi: "Kim yuvdi?" — ishchini tanlaydi va
/// ish o'sha ishchi nomidan saqlanadi (server tanlovni qayta tekshiradi).
///
/// Ishchilar: mosi tepada, mos kelmagani sababi bilan o'chirilgan holda.
/// Natija — saqlandi (`true`) yoki bekor qilindi.
Future<bool> openPerformerPicker(BuildContext context, {required WorkItem work, required StageAction action}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PerformerPicker(work: work, action: action),
  );
  return result ?? false;
}

class _PerformerPicker extends ConsumerStatefulWidget {
  final WorkItem work;
  final StageAction action;
  const _PerformerPicker({required this.work, required this.action});

  @override
  ConsumerState<_PerformerPicker> createState() => _PerformerPickerState();
}

class _PerformerPickerState extends ConsumerState<_PerformerPicker> {
  String? _selected;
  bool _busy = false;
  String? _error;
  final _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _selected = defaultPerformerFor(widget.work.item, widget.action);
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save(List<StaffMember> workers) async {
    final id = _selected;
    if (id == null) return;
    final note = _note.text.trim();
    if (widget.action.needsNote && note.length < 3) {
      setState(() => _error = 'Qaytarish sababini yozing');
      return;
    }
    final performer = workers.firstWhere((w) => w.id == id);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).changeItemStatus(
            orderId: widget.work.order.id,
            itemId: widget.work.item.id,
            toStatus: widget.action.toStatus,
            qcNote: widget.action.needsNote ? note : null,
            onBehalfOf: performer.id,
            performerName: performer.fullName,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (err) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = describeApiError(err);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final staffAsync = ref.watch(supervisorStaffProvider(dateKeyOf(DateTime.now())));
    final item = widget.work.item;
    final measurement = itemMeasurementLabel(item);

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.45,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scroll) => Container(
        decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: (widget.action.destructive ? AppColors.danger : AppColors.primary).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Icon(widget.action.icon, color: widget.action.destructive ? AppColors.danger : AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.action.question,
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.work.subId} · ${item.name}${measurement.isNotEmpty ? ' · $measurement' : ''}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: staffAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => _Message(text: "Xodimlarni yuklab bo'lmadi: ${describeApiError(err)}"),
                data: (staff) {
                  final workers = staff.where((s) => s.isWorker).toList();
                  if (workers.isEmpty) return const _Message(text: "Faol ishchi yo'q");
                  final rows = [
                    for (final w in workers) (worker: w, reason: ineligibilityReason(w, item, widget.action)),
                  ]..sort((a, b) {
                      if ((a.reason == null) != (b.reason == null)) return a.reason == null ? -1 : 1;
                      return a.worker.fullName.compareTo(b.worker.fullName);
                    });
                  final canSave = _selected != null && rows.any((r) => r.worker.id == _selected && r.reason == null);

                  return Column(
                    children: [
                      Expanded(
                        child: ListView(
                          controller: scroll,
                          padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
                          children: [
                            for (final r in rows)
                              _WorkerTile(
                                worker: r.worker,
                                reason: r.reason,
                                selected: _selected == r.worker.id,
                                isCurrentWasher: r.worker.id == item.washingBy,
                                onTap: r.reason == null ? () => setState(() => _selected = r.worker.id) : null,
                              ),
                            if (widget.action.needsNote) ...[
                              const SizedBox(height: 12),
                              TextField(
                                controller: _note,
                                minLines: 2,
                                maxLines: 4,
                                maxLength: 300,
                                textCapitalization: TextCapitalization.sentences,
                                decoration: const InputDecoration(
                                  labelText: 'Qaytarish sababi',
                                  hintText: "Masalan: dog' qolgan, hidi bor",
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      _SaveBar(
                        label: widget.action.label,
                        destructive: widget.action.destructive,
                        busy: _busy,
                        error: _error,
                        onSave: canSave && !_busy ? () => _save(workers) : null,
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkerTile extends StatelessWidget {
  final StaffMember worker;
  final String? reason;
  final bool selected;
  final bool isCurrentWasher;
  final VoidCallback? onTap;

  const _WorkerTile({required this.worker, required this.reason, required this.selected, required this.isCurrentWasher, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = reason == null;
    final subtitle = [
      if (!enabled) reason!,
      if (enabled && isCurrentWasher) 'Yuvishni boshlagan',
      if (enabled && worker.workTotal > 0) 'Bugun: ${worker.washed} yuvdi · ${worker.packed} upakovka',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: Material(
          color: selected ? AppColors.primary.withValues(alpha: 0.08) : AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: selected ? AppColors.primary : AppColors.border, width: selected ? 1.6 : 1),
              ),
              child: Row(
                children: [
                  EmployeeAvatar(name: worker.fullName, size: 40),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          worker.fullName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: enabled ? AppColors.grayDark : AppColors.danger,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Icon(
                    selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                    color: selected ? AppColors.primary : AppColors.gray,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SaveBar extends StatelessWidget {
  final String label;
  final bool destructive;
  final bool busy;
  final String? error;
  final VoidCallback? onSave;

  const _SaveBar({required this.label, required this.destructive, required this.busy, required this.error, required this.onSave});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 12 + MediaQuery.of(context).viewInsets.bottom),
      decoration: const BoxDecoration(color: AppColors.surface, border: Border(top: BorderSide(color: AppColors.border))),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child:
                    Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: FilledButton(
                onPressed: onSave,
                style: FilledButton.styleFrom(backgroundColor: destructive ? AppColors.danger : AppColors.primary),
                child: busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : Text(onSave == null && !busy ? 'Ishchini tanlang' : label, style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final String text;
  const _Message({required this.text});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600)),
        ),
      );
}

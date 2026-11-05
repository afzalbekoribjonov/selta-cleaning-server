import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/widgets/employee_avatar.dart';
import '../../core/widgets/selta_loader.dart';
import '../profile/today_activity_section.dart' show DailyActivityBody;
import 'staff_tab.dart' show attendanceChipOf;
import 'supervisor_widgets.dart';

const _categoryLabels = {'gilam': 'Gilam', 'parda': 'Parda', 'boshqa': 'Boshqa'};

/// Bitta xodim: tanlangan kundagi ishi (profilidagi bilan bir xil
/// ko'rinish, faqat o'qish uchun), ogohlantirishlar tarixi va yangi
/// ogohlantirish berish.
class StaffDetailScreen extends ConsumerStatefulWidget {
  final StaffMember member;
  final DateTime initialDay;

  const StaffDetailScreen({super.key, required this.member, required this.initialDay});

  @override
  ConsumerState<StaffDetailScreen> createState() => _StaffDetailScreenState();
}

class _StaffDetailScreenState extends ConsumerState<StaffDetailScreen> {
  late DateTime _day = widget.initialDay;

  @override
  Widget build(BuildContext context) {
    final date = dateKeyOf(_day);
    final key = (employeeId: widget.member.id, date: date);
    // Shu kundagi davomat va hisoblagichlar — ro'yxat bilan bitta so'rov (kesh).
    final member =
        ref.watch(supervisorStaffProvider(date)).valueOrNull?.where((s) => s.id == widget.member.id).firstOrNull ?? widget.member;
    final activityAsync = ref.watch(staffActivityProvider(key));
    final warningsAsync = ref.watch(staffWarningsProvider(member.id));
    final myId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;
    final canWarn = myId != null && myId != member.id;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(title: Text(member.fullName, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(staffWarningsProvider(member.id));
          ref.invalidate(supervisorStaffProvider(date));
          ref.invalidate(staffActivityProvider(key));
          try {
            await ref.read(staffActivityProvider(key).future);
          } catch (_) {
            // Xato kartada ko'rsatiladi.
          }
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            _ProfileCard(member: member, showAttendance: true),
            const SizedBox(height: 14),
            DayNavigator(day: _day, onChanged: (d) => setState(() => _day = d)),
            const SizedBox(height: 16),
            SectionHeader(
              title: 'Kunlik ish',
              subtitle: dayLabelUz(_day),
              trailing: IconButton(
                tooltip: 'Yangilash',
                visualDensity: VisualDensity.compact,
                onPressed: () => ref.invalidate(staffActivityProvider(key)),
                icon: const Icon(Icons.refresh_rounded, size: 20, color: AppColors.grayDark),
              ),
            ),
            activityAsync.when(
              loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: SeltaLoader(size: 32))),
              error: (err, _) => _ErrorCard(text: describeApiError(err), onRetry: () => ref.invalidate(staffActivityProvider(key))),
              data: (a) => DailyActivityBody(
                activity: a,
                departmentKey: member.department,
                canCreateOrders: member.department == 'dispatcher' || a.createdCount > 0,
                readOnly: true,
              ),
            ),
            const SizedBox(height: 22),
            SectionHeader(
              title: 'Ogohlantirishlar',
              subtitle: member.pendingWarnings > 0 ? '${member.pendingWarnings} tasi hali ko\'rilmagan' : null,
            ),
            warningsAsync.when(
              loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Center(child: SeltaLoader(size: 28))),
              error: (err, _) => _ErrorCard(text: describeApiError(err), onRetry: () => ref.invalidate(staffWarningsProvider(member.id))),
              data: (list) => list.isEmpty
                  ? Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: const Text(
                        "Ogohlantirish berilmagan",
                        style: TextStyle(fontSize: 13.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                      ),
                    )
                  : Column(children: [for (final w in list) _WarningTile(entry: w)]),
            ),
          ],
        ),
      ),
      bottomNavigationBar: canWarn
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                child: SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: () async {
                      final sent = await openWarnSheet(context, member);
                      if (sent && context.mounted) {
                        ref.invalidate(staffWarningsProvider(member.id));
                        ref.invalidate(supervisorStaffProvider(date));
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('${member.fullName}ga ogohlantirish yuborildi')),
                        );
                      }
                    },
                    style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                    icon: const Icon(Icons.campaign_rounded),
                    label: const Text('Ogohlantirish berish', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            )
          : null,
    );
  }
}

class _ProfileCard extends StatelessWidget {
  final StaffMember member;
  final bool showAttendance;
  const _ProfileCard({required this.member, required this.showAttendance});

  @override
  Widget build(BuildContext context) {
    final attendance = attendanceChipOf(member);
    final positions = <String>[
      for (final s in member.specializations) _categoryLabels[s] ?? s,
      if (member.canPack) 'Upakovkachi',
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          EmployeeAvatar(name: member.fullName, size: 56),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.fullName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.2),
                ),
                const SizedBox(height: 3),
                Text(
                  member.departmentLabel.isEmpty ? member.department : member.departmentLabel,
                  style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                ),
                if (positions.isNotEmpty || (showAttendance && attendance != null)) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (showAttendance && attendance != null) attendance,
                      for (final p in positions) InfoChip(text: p, color: AppColors.primary),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WarningTile extends StatelessWidget {
  final WarningEntry entry;
  const _WarningTile({required this.entry});

  @override
  Widget build(BuildContext context) {
    final seen = entry.ackAt != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: seen ? AppColors.border : AppColors.danger.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(entry.text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink, height: 1.35)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  [
                    if (entry.createdByName.isNotEmpty) entry.createdByName,
                    if (entry.createdAt != null) formatDateTimeUz(entry.createdAt!),
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.grayDark),
                ),
              ),
              const SizedBox(width: 8),
              InfoChip(
                text: seen ? 'Tanishdi ${formatTimeHm(entry.ackAt!)}' : "Ko'rmadi",
                color: seen ? AppColors.success : AppColors.danger,
                icon: seen ? Icons.done_all_rounded : Icons.visibility_off_rounded,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String text;
  final VoidCallback onRetry;
  const _ErrorCard({required this.text, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.danger, fontWeight: FontWeight.w600))),
          TextButton(onPressed: onRetry, child: const Text('Qayta urinish')),
        ],
      ),
    );
  }
}

/// Tez tanlanadigan matnlar — keyin tahrirlash mumkin.
const _templates = [
  'Ishga o\'z vaqtida keling',
  'Ish sifatiga e\'tibor bering',
  'Buyurtmalarni o\'z vaqtida yetkazing',
  'Mijozlar bilan muomalaga e\'tibor bering',
  'Ish joyini toza saqlang',
  'Mahsulot holatini ilovada o\'z vaqtida belgilang',
];

/// Ogohlantirish yozish oynasi. Yuborilsa `true`.
Future<bool> openWarnSheet(BuildContext context, StaffMember member) async {
  final sent = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _WarnSheet(member: member),
  );
  return sent ?? false;
}

class _WarnSheet extends ConsumerStatefulWidget {
  final StaffMember member;
  const _WarnSheet({required this.member});

  @override
  ConsumerState<_WarnSheet> createState() => _WarnSheetState();
}

class _WarnSheetState extends ConsumerState<_WarnSheet> {
  final _text = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.length < 3) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(supervisorRepositoryProvider).warnEmployee(widget.member.id, text);
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
    final valid = _text.text.trim().length >= 3;
    return Container(
      decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                    width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(Icons.campaign_rounded, color: AppColors.danger),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Ogohlantirish', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
                        Text(widget.member.fullName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final t in _templates)
                    ActionChip(
                      label: Text(t, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                      onPressed: () => _text.value = TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length)),
                      backgroundColor: AppColors.surface,
                      side: const BorderSide(color: AppColors.border),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _text,
                minLines: 3,
                maxLines: 6,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(hintText: 'Ogohlantirish matni'),
              ),
              const Text(
                "Xodim ilovasida qizil ogohlantirish chiqadi va bildirishnoma boradi. U \"Tanishdim\" bosgach, bu yerda ko'rinadi.",
                style: TextStyle(fontSize: 12, color: AppColors.grayDark, height: 1.35),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton(
                  onPressed: valid && !_busy ? _send : null,
                  style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                  child: _busy
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                      : const Text('Yuborish', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

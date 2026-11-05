import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/employee_repository.dart';
import '../../core/services/supervisor_repository.dart';
import '../../core/utils/date_utils.dart';

/// Xodim hujjatidagi o'qilmagan ogohlantirish (server: `pendingWarnings`).
class PendingWarning {
  final String id;
  final String text;
  final String byName;
  final DateTime? at;

  const PendingWarning({required this.id, required this.text, required this.byName, this.at});

  static List<PendingWarning> listOf(Map<String, dynamic>? employee) {
    final raw = employee?['pendingWarnings'];
    if (raw is! List) return const [];
    final list = <PendingWarning>[];
    for (final w in raw) {
      if (w is! Map || w['id'] == null) continue;
      list.add(PendingWarning(
        id: w['id'].toString(),
        text: w['text']?.toString() ?? '',
        byName: w['byName']?.toString() ?? '',
        at: (w['at'] as Timestamp?)?.toDate(),
      ));
    }
    // Eng yangisi tepada.
    list.sort((a, b) => (b.at ?? DateTime(0)).compareTo(a.at ?? DateTime(0)));
    return list;
  }
}

/// Nazoratchi bergan ogohlantirishlar — xodim "Tanishdim" bosmaguncha
/// bosh sahifa tepasida turadi. Xodim hujjati allaqachon jonli o'qiladi,
/// shuning uchun ogohlantirish darhol, qo'shimcha so'rovsiz paydo bo'ladi.
class WarningsBanner extends ConsumerStatefulWidget {
  const WarningsBanner({super.key});

  @override
  ConsumerState<WarningsBanner> createState() => _WarningsBannerState();
}

class _WarningsBannerState extends ConsumerState<WarningsBanner> {
  final _busy = <String>{};
  bool _expanded = false;

  Future<void> _ack(PendingWarning w) async {
    setState(() => _busy.add(w.id));
    try {
      await ref.read(supervisorRepositoryProvider).acknowledgeWarning(w.id);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Belgilab bo'lmadi: ${describeApiError(err)}"), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busy.remove(w.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final warnings = PendingWarning.listOf(ref.watch(currentEmployeeProvider).valueOrNull);
    if (warnings.isEmpty) return const SizedBox.shrink();
    final shown = _expanded ? warnings : warnings.take(1).toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Column(
        children: [
          for (final w in shown) ...[
            _WarningCard(warning: w, busy: _busy.contains(w.id), onAck: () => _ack(w)),
            const SizedBox(height: 8),
          ],
          if (warnings.length > 1)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => setState(() => _expanded = !_expanded),
                child: Text(_expanded ? 'Yig\'ish' : 'Yana ${warnings.length - 1} ta ogohlantirish'),
              ),
            ),
        ],
      ),
    );
  }
}

class _WarningCard extends StatelessWidget {
  final PendingWarning warning;
  final bool busy;
  final VoidCallback onAck;

  const _WarningCard({required this.warning, required this.busy, required this.onAck});

  @override
  Widget build(BuildContext context) {
    final meta = [
      if (warning.byName.isNotEmpty) warning.byName,
      if (warning.at != null) formatDateTimeUz(warning.at!),
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.warning_amber_rounded, color: AppColors.danger, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Ogohlantirish', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.danger)),
                    const SizedBox(height: 3),
                    Text(warning.text, style: const TextStyle(fontSize: 14, color: AppColors.ink, height: 1.35)),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(meta, style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark)),
                    ],
                  ],
                ),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: busy ? null : onAck,
              icon: busy
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check_rounded, size: 18),
              label: const Text('Tanishdim'),
            ),
          ),
        ],
      ),
    );
  }
}

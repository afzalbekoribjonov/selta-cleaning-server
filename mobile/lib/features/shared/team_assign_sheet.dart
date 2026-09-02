import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/employee_summary.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';

/// Dispetcher yoki Sifat nazorati joyida-yuvish buyurtmasiga jamoa
/// biriktiradi (talab #14). Ishchi bo'limidan xodimlar tanlanadi.
Future<void> openTeamAssignSheet(BuildContext context, String orderId) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _TeamAssignSheet(orderId: orderId),
  );
}

/// Joyida-yuvish jamoasi Ishchi VA Dastavchik bo'limlaridan aralash
/// tuzilishi mumkin (talab) — ikkalasidan ham ro'yxat olinib, qaysi
/// bo'limga tegishli ekani UI'da guruhlangan holda ko'rsatiladi.
class _TeamCandidate {
  final EmployeeSummary employee;
  final String departmentLabel;
  const _TeamCandidate(this.employee, this.departmentLabel);
}

final _teamCandidatesProvider = FutureProvider<List<_TeamCandidate>>((ref) async {
  final auth = ref.watch(authServiceProvider);
  final results = await Future.wait([
    auth.listEmployeesByDepartment('worker'),
    auth.listEmployeesByDepartment('delivery'),
  ]);
  return [
    for (final e in results[0]) _TeamCandidate(e, 'Ishchi'),
    for (final e in results[1]) _TeamCandidate(e, 'Dastavchik'),
  ];
});

class _TeamAssignSheet extends ConsumerStatefulWidget {
  final String orderId;
  const _TeamAssignSheet({required this.orderId});

  @override
  ConsumerState<_TeamAssignSheet> createState() => _TeamAssignSheetState();
}

class _TeamAssignSheetState extends ConsumerState<_TeamAssignSheet> {
  final Set<String> _selected = {};
  bool _saving = false;
  String? _error;

  Future<void> _submit() async {
    if (_selected.isEmpty) {
      setState(() => _error = "Kamida bitta xodim tanlang");
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).assignTeam(orderId: widget.orderId, employeeIds: _selected.toList());
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = describeApiError(e);
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final employeesAsync = ref.watch(_teamCandidatesProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Padding(
                // Talab: klaviatura chiqqanda eng pastdagi inputlar
                // yopilib qolmasligi kerak.
                padding: EdgeInsets.fromLTRB(20, 16, 20, 8 + MediaQuery.of(context).viewInsets.bottom),
                child: Text('Jamoa biriktirish', style: Theme.of(context).textTheme.titleLarge),
              ),
              Expanded(
                child: employeesAsync.when(
                  loading: () => const Center(child: SeltaLoader(size: 32)),
                  error: (e, _) => Center(child: Text(describeApiError(e))),
                  data: (candidates) {
                    if (candidates.isEmpty) {
                      return const Center(
                        child: Text("Ishchi yoki dastavchik bo'limida xodim yo'q", style: TextStyle(color: AppColors.gray)),
                      );
                    }
                    final byDept = <String, List<_TeamCandidate>>{};
                    for (final c in candidates) {
                      byDept.putIfAbsent(c.departmentLabel, () => []).add(c);
                    }
                    return ListView(
                      controller: scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      children: [
                        for (final entry in byDept.entries) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
                            child: Text(
                              entry.key,
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.primary),
                            ),
                          ),
                          for (final c in entry.value)
                            _CandidateTile(
                              candidate: c,
                              selected: _selected.contains(c.employee.id),
                              onToggle: (checked) => setState(() {
                                if (checked) {
                                  _selected.add(c.employee.id);
                                } else {
                                  _selected.remove(c.employee.id);
                                }
                              }),
                            ),
                        ],
                      ],
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                child: Column(
                  children: [
                    if (_error != null) ...[
                      Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 10),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving ? null : _submit,
                        style: FilledButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 16)),
                        child: _saving
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                            : const Text('BIRIKTIRISH', style: TextStyle(fontWeight: FontWeight.w800)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Jamoaga nomzod qatori. Talab: "Joyida yuvish"ga vakolati yo'q xodimlar
/// ro'yxatda KO'RINADI, lekin ismi qizil, belgilash imkonsiz, va ustiga
/// bosilganda sabab tushuntiriladi. Haqiqiy cheklov har doim serverda
/// (orders.ts: assignTeam `canDoOnsiteWashing`ni qayta tekshiradi) — bu
/// yerdagisi faqat ko'rinish/qulaylik uchun.
class _CandidateTile extends StatelessWidget {
  final _TeamCandidate candidate;
  final bool selected;
  final void Function(bool checked) onToggle;

  const _CandidateTile({required this.candidate, required this.selected, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final permitted = candidate.employee.canDoOnsiteWashing;

    if (permitted) {
      return CheckboxListTile(
        value: selected,
        onChanged: (checked) => onToggle(checked == true),
        title: Text(
          candidate.employee.fullName,
          style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink),
        ),
        activeColor: AppColors.primary,
      );
    }

    // Bloklangan nomzod: CheckboxListTile o'chirilgan holatda ko'rsatiladi
    // (AbsorbPointer uning o'z bosishlarini yutadi), tashqi GestureDetector
    // esa bosishni ushlab, sababni ko'rsatadi.
    return GestureDetector(
      onTap: () {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.floating,
              backgroundColor: AppColors.danger,
              content: Text(
                "${candidate.employee.fullName} — joyida yuvish vakolati yo'q. Admin panel orqali ruxsat berilishi kerak.",
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          );
      },
      child: AbsorbPointer(
        child: CheckboxListTile(
          value: false,
          onChanged: null,
          title: Text(
            candidate.employee.fullName,
            style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.danger),
          ),
          subtitle: const Text(
            "Ruxsat yo'q",
            style: TextStyle(color: AppColors.danger, fontSize: 11.5, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

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

final _workerEmployeesProvider = FutureProvider<List<EmployeeSummary>>((ref) {
  return ref.watch(authServiceProvider).listEmployeesByDepartment('worker');
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
    final employeesAsync = ref.watch(_workerEmployeesProvider);

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
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text('Jamoa biriktirish', style: Theme.of(context).textTheme.titleLarge),
              ),
              Expanded(
                child: employeesAsync.when(
                  loading: () => const Center(child: SeltaLoader(size: 32)),
                  error: (e, _) => Center(child: Text(describeApiError(e))),
                  data: (employees) {
                    if (employees.isEmpty) {
                      return const Center(child: Text("Ishchi bo'limida xodim yo'q", style: TextStyle(color: AppColors.gray)));
                    }
                    return ListView(
                      controller: scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      children: [
                        for (final e in employees)
                          CheckboxListTile(
                            value: _selected.contains(e.id),
                            onChanged: (checked) => setState(() {
                              if (checked == true) {
                                _selected.add(e.id);
                              } else {
                                _selected.remove(e.id);
                              }
                            }),
                            title: Text(e.fullName, style: const TextStyle(fontWeight: FontWeight.w700)),
                            activeColor: AppColors.primary,
                          ),
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

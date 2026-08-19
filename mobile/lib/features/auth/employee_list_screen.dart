import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/employee_summary.dart';
import '../../core/services/auth_service.dart';
import '../../core/widgets/selta_loader.dart';

final _employeesByDepartmentProvider =
    FutureProvider.family<List<EmployeeSummary>, String>((ref, department) {
  return ref.watch(authServiceProvider).listEmployeesByDepartment(department);
});

/// Bo'lim tanlangach xodimlar ro'yxati — ism-familiyasini bosish orqali PIN
/// ekraniga o'tiladi. `departmentName == 'other'` bo'lsa, 4 ta doimiy
/// bo'limga tegishli bo'lmagan (admin panelda "Boshqa" orqali yaratilgan)
/// xodimlar aralash ro'yxati ko'rsatiladi — har biri o'z kasbi bilan.
class EmployeeListScreen extends ConsumerWidget {
  final String departmentName;

  const EmployeeListScreen({super.key, required this.departmentName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOther = departmentName == 'other';
    final department = isOther
        ? null
        : Department.values.firstWhere((d) => d.name == departmentName, orElse: () => Department.dispatcher);
    final info = department != null ? kDepartmentConfig[department] : null;
    final title = info?.label ?? 'Boshqa xodimlar';
    final employeesAsync = ref.watch(_employeesByDepartmentProvider(departmentName));

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: employeesAsync.when(
        loading: () => const SeltaLoadingView(),
        error: (err, _) => _ErrorState(
          message: describeApiError(err),
          onRetry: () => ref.invalidate(_employeesByDepartmentProvider(departmentName)),
        ),
        data: (employees) {
          if (employees.isEmpty) {
            return _EmptyState(isOther: isOther);
          }
          return ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: employees.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, i) {
              final employee = employees[i];
              return _EmployeeTile(
                employee: employee,
                departmentLabel: employee.departmentLabel ?? info?.label ?? '',
                onTap: () => context.push('/pin/${employee.id}', extra: employee.fullName),
              );
            },
          );
        },
      ),
    );
  }
}

class _EmployeeTile extends StatelessWidget {
  final EmployeeSummary employee;
  final String departmentLabel;
  final VoidCallback onTap;

  const _EmployeeTile({required this.employee, required this.departmentLabel, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: const BoxDecoration(gradient: heroGradient, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: Text(
                  employee.fullName.isNotEmpty ? employee.fullName[0].toUpperCase() : '?',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      employee.fullName,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, color: AppColors.ink),
                    ),
                    if (departmentLabel.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        departmentLabel,
                        style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.gray),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final bool isOther;
  const _EmptyState({required this.isOther});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.people_outline_rounded, size: 48, color: AppColors.gray),
            const SizedBox(height: 12),
            Text(
              isOther ? "Boshqa kasbdagi xodim yo'q" : "Bu bo'limda hali xodim yo'q",
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            const Text(
              'Admin panel orqali xodim qo\'shilishi kerak',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.grayDark, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatefulWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  State<_ErrorState> createState() => _ErrorStateState();
}

class _ErrorStateState extends State<_ErrorState> {
  bool _retrying = false;

  Future<void> _handleRetry() async {
    setState(() => _retrying = true);
    widget.onRetry();
    // Tugmadagi loading icon natija ekranga chiqquncha aylanib tursin
    // (talab) — provider qayta yuklanguncha kichik minimal ko'rinish vaqti.
    await Future.delayed(const Duration(milliseconds: 600));
    if (mounted) setState(() => _retrying = false);
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 48, color: AppColors.danger),
            const SizedBox(height: 12),
            Text(widget.message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: _retrying ? null : _handleRetry,
              child: _retrying
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                    )
                  : const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }
}

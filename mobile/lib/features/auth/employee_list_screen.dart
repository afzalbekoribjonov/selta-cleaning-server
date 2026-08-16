import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/employee_summary.dart';
import '../../core/services/auth_service.dart';

final _employeesByDepartmentProvider =
    FutureProvider.family<List<EmployeeSummary>, String>((ref, department) {
  return ref.watch(authServiceProvider).listEmployeesByDepartment(department);
});

/// Bo'lim tanlangach xodimlar ro'yxati — talab #2: ism-familiyasini bosish
/// orqali PIN ekraniga o'tiladi.
class EmployeeListScreen extends ConsumerWidget {
  final String departmentName;

  const EmployeeListScreen({super.key, required this.departmentName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final department = Department.values.firstWhere(
      (d) => d.name == departmentName,
      orElse: () => Department.dispatcher,
    );
    final info = kDepartmentConfig[department]!;
    final employeesAsync = ref.watch(_employeesByDepartmentProvider(departmentName));

    return Scaffold(
      appBar: AppBar(title: Text(info.label)),
      body: employeesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _ErrorState(
          message: describeFunctionsError(err),
          onRetry: () => ref.invalidate(_employeesByDepartmentProvider(departmentName)),
        ),
        data: (employees) {
          if (employees.isEmpty) {
            return const _EmptyState();
          }
          return ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: employees.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, i) {
              final employee = employees[i];
              return _EmployeeTile(
                employee: employee,
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
  final VoidCallback onTap;

  const _EmployeeTile({required this.employee, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                child: Text(
                  employee.fullName.isNotEmpty ? employee.fullName[0].toUpperCase() : '?',
                  style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  employee.fullName,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5),
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
  const _EmptyState();

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
            const Text(
              "Bu bo'limda hali xodim yo'q",
              style: TextStyle(fontWeight: FontWeight.w700),
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

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

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
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Qayta urinish')),
          ],
        ),
      ),
    );
  }
}

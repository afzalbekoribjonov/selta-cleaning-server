import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/employee_summary.dart';
import '../../core/services/auth_service.dart';
import '../../core/widgets/employee_avatar.dart';
import '../../core/widgets/selta_loader.dart';

final _employeesByDepartmentProvider =
    FutureProvider.family<List<EmployeeSummary>, String>((ref, department) {
  return ref.watch(authServiceProvider).listEmployeesByDepartment(department);
});

/// Bo'lim tanlangach xodimlar ro'yxati — ism-familiyasini bosish orqali PIN
/// ekraniga o'tiladi. `departmentName == 'other'` bo'lsa, 4 ta doimiy
/// bo'limga tegishli bo'lmagan (admin panelda "Boshqa" orqali yaratilgan)
/// xodimlar aralash ro'yxati ko'rsatiladi — har biri o'z kasbi bilan.
class EmployeeListScreen extends ConsumerStatefulWidget {
  final String departmentName;

  const EmployeeListScreen({super.key, required this.departmentName});

  @override
  ConsumerState<EmployeeListScreen> createState() => _EmployeeListScreenState();
}

class _EmployeeListScreenState extends ConsumerState<EmployeeListScreen> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final departmentName = widget.departmentName;
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
          final sorted = [...employees]..sort((a, b) => a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()));
          final shown = _search.isEmpty
              ? sorted
              : sorted.where((e) => e.fullName.toLowerCase().contains(_search)).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                child: Text(
                  "Ismingizni tanlang · ${employees.length} ta xodim",
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.grayDark),
                ),
              ),
              // Xodim ko'p bo'lsa — ismni yozib topish tezroq.
              if (employees.length > 6) ...[
                TextField(
                  onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
                  textInputAction: TextInputAction.search,
                  decoration: const InputDecoration(
                    hintText: 'Ism bo\'yicha qidirish',
                    prefixIcon: Icon(Icons.search_rounded, size: 20),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              if (shown.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Text('Topilmadi', textAlign: TextAlign.center, style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
                ),
              for (final employee in shown) ...[
                _EmployeeTile(
                  employee: employee,
                  // Bo'lim nomi sarlavhada bor — belgi faqat aralash "Boshqa"
                  // ro'yxatida (har bir xodimning o'z kasbi).
                  departmentLabel: employee.departmentLabel ?? '',
                  onTap: () => context.push('/pin/${employee.id}', extra: employee.fullName),
                ),
                const SizedBox(height: 10),
              ],
            ],
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
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.border),
            boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 3))],
          ),
          child: Row(
            children: [
              EmployeeAvatar(name: employee.fullName, size: 48),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      employee.fullName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.ink, height: 1.2),
                    ),
                    if (departmentLabel.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.07),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          departmentLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11.5, color: AppColors.primary, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 34,
                height: 34,
                decoration: const BoxDecoration(color: AppColors.bg, shape: BoxShape.circle),
                child: const Icon(Icons.lock_outline_rounded, size: 17, color: AppColors.grayDark),
              ),
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
            if (!isOther) ...[
              const SizedBox(height: 4),
              const Text(
                'Admin panel orqali xodim qo\'shilishi kerak',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.grayDark, fontSize: 13),
              ),
            ],
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

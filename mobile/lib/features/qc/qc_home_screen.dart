import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_assign_sheet.dart';
import '../shared/team_jobs_section.dart';
import 'qc_order_detail_sheet.dart';

/// Sifat nazorati paneli — talab #6: upakovkaga yetib kelgan (qc_review
/// holatidagi) buyurtmalarni tekshiradi, har bir mahsulotni alohida
/// pass/fail qiladi. Talab #14: joyida-yuvish buyurtmalariga jamoa
/// biriktirish (Dispetcher bilan bir qatorda) ham shu yerda.
class QcHomeScreen extends ConsumerStatefulWidget {
  const QcHomeScreen({super.key});

  @override
  ConsumerState<QcHomeScreen> createState() => _QcHomeScreenState();
}

class _QcHomeScreenState extends ConsumerState<QcHomeScreen> {
  int _tabIndex = 0;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(recentOrdersProvider);
    final showTeamAssign = _tabIndex == 1;

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Sifat nazorati', employeeName: fullName),
      body: Column(
        children: [
          const TeamJobsSection(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Ism, telefon yoki # bo\'yicha qidirish',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                isDense: true,
                filled: true,
                fillColor: AppColors.surface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
              ),
            ),
          ),
          Expanded(
            child: ordersAsync.when(
              loading: () => const SeltaLoadingView(),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                var filtered = showTeamAssign
                    ? orders.where((o) => o.serviceType == 'onsite' && o.status == 'new').toList()
                    : orders.where((o) => o.status == 'qc_review').toList();

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      showTeamAssign ? 'Jamoa biriktirish kerak bo\'lgan buyurtma yo\'q' : 'Tekshirish uchun buyurtma yo\'q',
                      style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final order = filtered[i];
                    return OrderCard(
                      order: order,
                      onTap: () => showTeamAssign ? openTeamAssignSheet(context, order.id) : openQcOrderDetailSheet(context, order),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: ordersAsync.when(
        loading: () => null,
        error: (_, __) => null,
        data: (orders) {
          final reviewCount = orders.where((o) => o.status == 'qc_review').length;
          final teamCount = orders.where((o) => o.serviceType == 'onsite' && o.status == 'new').length;

          return NavigationBar(
            selectedIndex: _tabIndex,
            onDestinationSelected: (i) => setState(() => _tabIndex = i),
            destinations: [
              NavigationDestination(
                icon: _BadgedIcon(icon: Icons.fact_check_rounded, count: reviewCount),
                label: 'Tekshirish',
              ),
              NavigationDestination(
                icon: _BadgedIcon(icon: Icons.groups_rounded, count: teamCount),
                label: 'Jamoa biriktirish',
              ),
            ],
          );
        },
      ),
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  final IconData icon;
  final int count;
  const _BadgedIcon({required this.icon, required this.count});

  @override
  Widget build(BuildContext context) {
    if (count == 0) return Icon(icon);
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      backgroundColor: AppColors.danger,
      child: Icon(icon),
    );
  }
}

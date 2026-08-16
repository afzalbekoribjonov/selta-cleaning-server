import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/confirm_logout.dart';
import '../dispatcher/widgets/order_card.dart';
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
  bool _showTeamAssign = false;

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(recentOrdersProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Sifat nazorati'),
            Text(fullName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.grayDark)),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => confirmLogout(context, ref),
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Chiqish',
          ),
        ],
      ),
      body: Column(
        children: [
          const TeamJobsSection(),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                _Chip(label: 'Tekshirish', selected: !_showTeamAssign, onTap: () => setState(() => _showTeamAssign = false)),
                const SizedBox(width: 8),
                _Chip(label: "Jamoa biriktirish", selected: _showTeamAssign, onTap: () => setState(() => _showTeamAssign = true)),
              ],
            ),
          ),
          Expanded(
            child: ordersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                final filtered = _showTeamAssign
                    ? orders.where((o) => o.serviceType == 'onsite' && o.status == 'new').toList()
                    : orders.where((o) => o.status == 'qc_review').toList();
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      _showTeamAssign ? 'Jamoa biriktirish kerak bo\'lgan buyurtma yo\'q' : 'Tekshirish uchun buyurtma yo\'q',
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
                      onTap: () => _showTeamAssign ? openTeamAssignSheet(context, order.id) : openQcOrderDetailSheet(context, order),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _Chip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: selected ? AppColors.primary : AppColors.border)),
          child: Text(label, style: TextStyle(color: selected ? Colors.white : AppColors.ink, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ),
      ),
    );
  }
}

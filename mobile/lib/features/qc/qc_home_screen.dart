import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/order_detail_sheet.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_assign_sheet.dart';
import '../shared/team_jobs_section.dart';
import 'qc_order_detail_sheet.dart';

/// Sifat nazorati "Faol buyurtmalar" tabida ko'rinadigan bosqichlar —
/// talab: butun "Olib kelish" quvurini kuzatib borish (o'z bosqichida
/// tekshirish bilan bir qatorda), o'qish uchun.
const _activeStages = ['brought_in', 'washing', 'packing', 'ready'];

/// Sifat nazorati paneli — upakovkaga yetib kelgan (qc_review holatidagi)
/// buyurtmalarni tekshiradi, har bir mahsulotni alohida pass/fail qiladi.
/// Joyida-yuvish buyurtmalariga jamoa biriktirish (Dispetcher bilan bir
/// qatorda) va butun "Olib kelish" quvurini kuzatib borish uchun "Faol
/// buyurtmalar" tabi ham shu yerda.
class QcHomeScreen extends ConsumerStatefulWidget {
  const QcHomeScreen({super.key});

  @override
  ConsumerState<QcHomeScreen> createState() => _QcHomeScreenState();
}

class _QcHomeScreenState extends ConsumerState<QcHomeScreen> {
  int _tabIndex = 0;
  int _activeStageIndex = 0;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(recentOrdersProvider);
    final showActive = _tabIndex == 0;
    final showReview = _tabIndex == 1;
    final showTeamAssign = _tabIndex == 2;

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Sifat nazorati', employeeName: fullName),
      body: Column(
        children: [
          const TeamJobsSection(),
          if (showActive) ...[
            // Chip balandligi + tepa/pastdan bab-baravar joy — avval faqat
            // 40px va faqat tepadan padding berilgani uchun matn pastga
            // "cho'kib" kesilib qolayotgan edi (talab bo'yicha tuzatildi).
            SizedBox(
              height: 60,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                itemCount: _activeStages.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final selected = i == _activeStageIndex;
                  final label = statusOf(_activeStages[i]).label;
                  return ChoiceChip(
                    label: Text(label),
                    selected: selected,
                    onSelected: (_) => setState(() => _activeStageIndex = i),
                    selectedColor: AppColors.primary,
                    visualDensity: VisualDensity.compact,
                    labelStyle: TextStyle(
                      color: selected ? Colors.white : AppColors.ink,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    ),
                    backgroundColor: AppColors.surface,
                    side: BorderSide(color: selected ? AppColors.primary : AppColors.border),
                  );
                },
              ),
            ),
          ],
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
                    : showReview
                        ? orders.where((o) => o.status == 'qc_review').toList()
                        : orders
                            .where((o) => o.serviceType == 'pickup' && o.status == _activeStages[_activeStageIndex])
                            .toList();

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (filtered.isEmpty) {
                  final emptyMessage = showTeamAssign
                      ? 'Jamoa biriktirish kerak bo\'lgan buyurtma yo\'q'
                      : showReview
                          ? 'Tekshirish uchun buyurtma yo\'q'
                          : 'Bu bosqichda buyurtma yo\'q';
                  return Center(
                    child: Text(emptyMessage, style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
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
                      onTap: () {
                        if (showTeamAssign) {
                          openTeamAssignSheet(context, order.id);
                        } else if (showReview) {
                          openQcOrderDetailSheet(context, order);
                        } else {
                          openOrderDetailSheet(context, order);
                        }
                      },
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
          final activeCount = orders.where((o) => o.serviceType == 'pickup' && _activeStages.contains(o.status)).length;
          final reviewCount = orders.where((o) => o.status == 'qc_review').length;
          final teamCount = orders.where((o) => o.serviceType == 'onsite' && o.status == 'new').length;

          return NavigationBar(
            selectedIndex: _tabIndex,
            onDestinationSelected: (i) => setState(() => _tabIndex = i),
            destinations: [
              NavigationDestination(
                icon: _BadgedIcon(icon: Icons.list_alt_rounded, count: activeCount),
                label: 'Faol buyurtmalar',
              ),
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

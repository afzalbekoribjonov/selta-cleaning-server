import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart';
import '../../core/sync/sync_status_button.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/app_bottom_nav.dart';
import '../../core/widgets/employee_avatar.dart';
import '../search/global_search_screen.dart';
import '../shared/employee_app_bar.dart' show EmployeeMenuButton;
import '../shared/warnings_banner.dart';
import 'delivery_plan_tab.dart';
import 'staff_tab.dart';
import 'supervisor_orders_tab.dart';
import 'supervisor_workflow.dart';
import 'workflow_tab.dart';

/// Nazoratchi paneli — ish jarayonini to'liq boshqarish.
///
/// Boshqa xodimlarning oddiy ro'yxatlaridan farqli: brendlangan sarlavha
/// (kim, bugun nima bo'ldi), to'rt bo'lim —
///  - Jarayon   — sexdagi har bir mahsulot bosqichi bo'yicha; ishni ishchi
///                nomidan qayd etish;
///  - Yetkazish — dastavchiklarga kunlik topshiriq;
///  - Xodimlar  — bugungi ish, davomat, ogohlantirishlar;
///  - Buyurtmalar — qidiruv va sahifalab ko'rish.
///
/// Firebase'ni tejash: faol buyurtmalar ilovadagi umumiy oqimdan (boshqa
/// bo'limlar bilan bir xil, keshlangan), mahsulotlar buyurtmadagi
/// nusxadan; yakunlangan buyurtmalar faqat so'ralganda, sahifalab.
class SupervisorHomeScreen extends ConsumerStatefulWidget {
  const SupervisorHomeScreen({super.key});

  @override
  ConsumerState<SupervisorHomeScreen> createState() => _SupervisorHomeScreenState();
}

class _SupervisorHomeScreenState extends ConsumerState<SupervisorHomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
    final counts = stageCounts(orders);
    final inWork = (counts['pending'] ?? 0) + (counts['washing'] ?? 0) + (counts['packing'] ?? 0) + (counts['returned'] ?? 0);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Column(
        children: [
          _Header(showToday: _tab == 0),
          const WarningsBanner(),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: const [
                WorkflowTab(),
                DeliveryPlanTab(),
                StaffTab(),
                SupervisorOrdersTab(),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: AppBottomNav(
        currentIndex: _tab,
        onSelect: (i) => setState(() => _tab = i),
        items: [
          AppNavItem(
              label: 'Jarayon',
              icon: Icons.precision_manufacturing_outlined,
              activeIcon: Icons.precision_manufacturing_rounded,
              count: inWork),
          const AppNavItem(label: 'Yetkazish', icon: Icons.local_shipping_outlined, activeIcon: Icons.local_shipping_rounded),
          const AppNavItem(label: 'Xodimlar', icon: Icons.groups_outlined, activeIcon: Icons.groups_rounded),
          const AppNavItem(label: 'Buyurtmalar', icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long_rounded),
        ],
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  final bool showToday;
  const _Header({required this.showToday});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(currentEmployeeProvider).valueOrNull?['fullName'] as String? ?? '...';
    final now = DateTime.now();

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: primaryGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 6, 14),
          child: Column(
            children: [
              Row(
                children: [
                  InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => context.push('/profile'),
                    child: Padding(
                      padding: const EdgeInsets.all(2),
                      child: EmployeeAvatar(name: name, size: 44, ring: true),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800, height: 1.2),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(6)),
                              child: const Text(
                                'NAZORATCHI',
                                style: TextStyle(color: AppColors.ink, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.6),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                formatDateUz(now),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    child: SyncStatusButton(),
                  ),
                  IconButton(
                    tooltip: 'Qidiruv',
                    onPressed: () => openGlobalSearch(context),
                    icon: const Icon(Icons.search_rounded, color: Colors.white),
                  ),
                  const EmployeeMenuButton(iconColor: Colors.white),
                ],
              ),
              if (showToday) ...[
                const SizedBox(height: 12),
                Padding(padding: const EdgeInsets.only(right: 10), child: _TodayStrip(dateKey: dateKeyOf(now))),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Bugungi natija — bosilsa to'liq kunlik ko'rsatkichlar.
class _TodayStrip extends ConsumerWidget {
  final String dateKey;
  const _TodayStrip({required this.dateKey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(dailyStatsProvider(dateKey)).valueOrNull;
    String v(int? n) => n == null ? '—' : '$n';
    return Material(
      color: Colors.white.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/stats'),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          child: Row(
            children: [
              Expanded(child: _Metric(label: 'Sexga keldi', value: v(stats?.broughtInCount))),
              Expanded(child: _Metric(label: 'Yuvildi', value: v(stats?.washedCount))),
              Expanded(child: _Metric(label: 'Yetkazildi', value: v(stats?.deliveredCount))),
              Expanded(
                flex: 2,
                child: _Metric(label: 'Kassa', value: stats == null ? '—' : formatMoneyShortUz(stats.cashTotal)),
              ),
              Icon(Icons.chevron_right_rounded, color: Colors.white.withValues(alpha: 0.8)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  final String label;
  final String value;
  const _Metric({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900, height: 1.1)),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

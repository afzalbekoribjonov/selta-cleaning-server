import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/warnings_banner.dart';
import '../../core/services/employee_repository.dart';
import '../../core/widgets/app_bottom_nav.dart';
import '../shared/employee_app_bar.dart';
import 'active_orders_tab.dart';
import 'new_order_tab.dart';

/// Dispetcher paneli — pastki navigatsiya: Faol buyurtmalar / Yangi buyurtma.
class DispatcherHomeScreen extends ConsumerStatefulWidget {
  const DispatcherHomeScreen({super.key});

  @override
  ConsumerState<DispatcherHomeScreen> createState() => _DispatcherHomeScreenState();
}

class _DispatcherHomeScreenState extends ConsumerState<DispatcherHomeScreen> {
  int _index = 0;

  void _goToActiveTab() => setState(() => _index = 0);

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Sotuv menejeri', employeeName: fullName),
      body: Column(
        children: [
          const WarningsBanner(),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: [
                const ActiveOrdersTab(),
                NewOrderTab(onSaved: _goToActiveTab),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: AppBottomNav(
        currentIndex: _index,
        onSelect: (i) => setState(() => _index = i),
        items: const [
          AppNavItem(label: 'Faol buyurtmalar', icon: Icons.list_alt_outlined, activeIcon: Icons.list_alt_rounded),
          AppNavItem(label: 'Yangi buyurtma', icon: Icons.add_circle_outline_rounded, activeIcon: Icons.add_circle_rounded),
        ],
      ),
    );
  }
}

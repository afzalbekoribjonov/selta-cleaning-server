import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/employee_repository.dart';
import '../../core/widgets/confirm_logout.dart';
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
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Dispetcher'),
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
      body: IndexedStack(
        index: _index,
        children: [
          const ActiveOrdersTab(),
          NewOrderTab(onSaved: _goToActiveTab),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.list_alt_rounded), label: 'Faol buyurtmalar'),
          NavigationDestination(icon: Icon(Icons.add_circle_rounded), label: 'Yangi buyurtma'),
        ],
      ),
    );
  }
}

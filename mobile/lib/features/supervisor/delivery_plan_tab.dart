import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/widgets/employee_avatar.dart';
import '../../core/widgets/filter_pill.dart';
import '../delivery/driver_tasks.dart' show isAssignmentOpen;
import 'delivery_planner_screen.dart';
import 'delivery_planning.dart';
import 'staff_tab.dart' show attendanceChipOf;
import 'supervisor_widgets.dart' show InfoChip;

/// "Yetkazish" — dastavchiklar va ularning kunlik topshirig'i. Dastavchik
/// bosilsa topshiriqni tuzish ekrani ochiladi.
class DeliveryPlanTab extends ConsumerStatefulWidget {
  const DeliveryPlanTab({super.key});

  @override
  ConsumerState<DeliveryPlanTab> createState() => _DeliveryPlanTabState();
}

class _DeliveryPlanTabState extends ConsumerState<DeliveryPlanTab> {
  bool _tomorrow = false;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = dateKeyOf(now);
    final date = _tomorrow ? dateKeyOf(now.add(const Duration(days: 1))) : today;
    final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
    final staffAsync = ref.watch(supervisorStaffProvider(today));

    var deliveries = 0, pickups = 0, freeDeliveries = 0, freePickups = 0;
    for (final o in orders) {
      final kind = planKindOf(o);
      if (kind == null) continue;
      final assigned = o.assignment != null && isAssignmentOpen(o);
      if (kind == PlanKind.delivery) {
        deliveries++;
        if (!assigned) freeDeliveries++;
      } else {
        pickups++;
        if (!assigned) freePickups++;
      }
    }

    return RefreshIndicator(
      onRefresh: () => ref.refresh(supervisorStaffProvider(today).future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Row(
            children: [
              FilterPill(label: 'Bugun', selected: !_tomorrow, onTap: () => setState(() => _tomorrow = false)),
              const SizedBox(width: 8),
              FilterPill(label: 'Ertaga', selected: _tomorrow, onTap: () => setState(() => _tomorrow = true)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _SummaryTile(
                  icon: Icons.inventory_2_rounded,
                  color: AppColors.success,
                  title: 'Yetkazish',
                  value: deliveries,
                  free: freeDeliveries,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SummaryTile(
                  icon: Icons.move_to_inbox_rounded,
                  color: AppColors.info,
                  title: 'Olib kelish',
                  value: pickups,
                  free: freePickups,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Text('Dastavchiklar', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 2),
          const Text(
            "Dastavchikni tanlab, buyurtmalar va aniq mahsulotlarni topshiriq qiling",
            style: TextStyle(fontSize: 12.5, color: AppColors.grayDark),
          ),
          const SizedBox(height: 10),
          staffAsync.when(
            loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
            error: (err, _) => _ErrorNote(text: describeApiError(err), onRetry: () => ref.invalidate(supervisorStaffProvider(today))),
            data: (staff) {
              final drivers = staff.where((s) => s.isDriver).toList();
              if (drivers.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text("Faol dastavchik yo'q", textAlign: TextAlign.center, style: TextStyle(color: AppColors.grayDark)),
                );
              }
              return Column(
                children: [
                  for (final d in drivers)
                    _DriverCard(
                      driver: d,
                      stops: stopCountFor(orders, d.id, date),
                      showToday: !_tomorrow,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: (_) => DeliveryPlannerScreen(driver: d, date: date)),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final int value;
  final int free;

  const _SummaryTile({required this.icon, required this.color, required this.title, required this.value, required this.free});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.grayDark)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('$value ta', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.ink)),
          Text(
            free == 0 ? 'Hammasi biriktirilgan' : '$free tasi biriktirilmagan',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: free == 0 ? AppColors.success : const Color(0xFFDD6B20)),
          ),
        ],
      ),
    );
  }
}

class _DriverCard extends StatelessWidget {
  final StaffMember driver;
  final int stops;
  final bool showToday;
  final VoidCallback onTap;

  const _DriverCard({required this.driver, required this.stops, required this.showToday, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final attendance = attendanceChipOf(driver);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
            child: Row(
              children: [
                EmployeeAvatar(name: driver.fullName, size: 46),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(driver.fullName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      if (showToday) ...[
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            if (attendance != null) attendance,
                            InfoChip(text: 'Yetkazdi ${driver.delivered}', color: AppColors.success, icon: Icons.check_circle_rounded),
                            if (driver.pickedUp > 0)
                              InfoChip(text: 'Olib keldi ${driver.pickedUp}', color: AppColors.primary, icon: Icons.local_shipping_rounded),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: stops > 0 ? AppColors.primary.withValues(alpha: 0.1) : AppColors.bg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      Text('$stops',
                          style:
                              TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: stops > 0 ? AppColors.primary : AppColors.gray)),
                      Text('topshiriq',
                          style: TextStyle(
                              fontSize: 10.5, fontWeight: FontWeight.w700, color: stops > 0 ? AppColors.primary : AppColors.gray)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.gray),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorNote extends StatelessWidget {
  final String text;
  final VoidCallback onRetry;
  const _ErrorNote({required this.text, required this.onRetry});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: onRetry, child: const Text('Qayta urinish')),
          ],
        ),
      );
}

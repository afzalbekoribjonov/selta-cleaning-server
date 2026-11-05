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
import 'delivery_planning.dart';

/// Bitta buyurtmani dastavchikka biriktirish: dastavchik va kun (bugun /
/// ertaga). Mavjud topshiriqqa qo'shiladi, boshqa buyurtmalari saqlanadi.
Future<bool> openAssignDriverSheet(BuildContext context, Order order) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _AssignDriverSheet(order: order),
  );
  return result ?? false;
}

class _AssignDriverSheet extends ConsumerStatefulWidget {
  final Order order;
  const _AssignDriverSheet({required this.order});

  @override
  ConsumerState<_AssignDriverSheet> createState() => _AssignDriverSheetState();
}

class _AssignDriverSheetState extends ConsumerState<_AssignDriverSheet> {
  late String _date;
  String? _driverId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final today = dateKeyOf(DateTime.now());
    final a = widget.order.assignment;
    _date = a != null && a.date.compareTo(today) >= 0 ? a.date : today;
    _driverId = a?.driverId;
  }

  Future<void> _save() async {
    final driverId = _driverId;
    if (driverId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final orders = ref.read(ordersProvider).valueOrNull ?? const <Order>[];
      // Mahsulotlar tanlanmasa — hozir tayyorlarining hammasi (server
      // ham shunday qiladi); oldin aniq mahsulotlar tanlangan bo'lsa,
      // ularning hali tayyorlari saqlanadi.
      final previous = widget.order.assignment;
      final ready = readyItemsOf(widget.order).map((i) => i.id).toSet();
      final keep = previous != null && !previous.isPickup && previous.itemIds.isNotEmpty
          ? previous.itemIds.where(ready.contains).toList()
          : const <String>[];
      await addOrderToDriver(
        ref.read(supervisorRepositoryProvider),
        orders: orders,
        order: widget.order,
        driverId: driverId,
        date: _date,
        itemIds: keep,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (err) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = describeApiError(err);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = dateKeyOf(now);
    final tomorrow = dateKeyOf(now.add(const Duration(days: 1)));
    final staffAsync = ref.watch(supervisorStaffProvider(today));
    final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
    final kind = planKindOf(widget.order);

    return Container(
      decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Dastavchikka biriktirish',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 2),
                    Text(
                      '${widget.order.displayNumber} · ${kind == PlanKind.pickup ? 'mijozdan olib kelish' : 'tayyorlarini yetkazish'}',
                      style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                    ),
                  ],
                ),
              ),
              FilterPillBar(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                children: [
                  FilterPill(label: 'Bugun', selected: _date == today, onTap: () => setState(() => _date = today)),
                  FilterPill(label: 'Ertaga', selected: _date == tomorrow, onTap: () => setState(() => _date = tomorrow)),
                ],
              ),
              Flexible(
                child: staffAsync.when(
                  loading: () => const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
                  error: (err, _) => Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text("Dastavchiklarni yuklab bo'lmadi: ${describeApiError(err)}", textAlign: TextAlign.center),
                  ),
                  data: (staff) {
                    final drivers = staff.where((s) => s.isDriver).toList();
                    if (drivers.isEmpty) {
                      return const Padding(padding: EdgeInsets.all(24), child: Text("Faol dastavchik yo'q", textAlign: TextAlign.center));
                    }
                    return ListView(
                      shrinkWrap: true,
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                      children: [
                        for (final d in drivers)
                          _DriverTile(
                            driver: d,
                            stops: stopCountFor(orders, d.id, _date),
                            selected: _driverId == d.id,
                            onTap: () => setState(() => _driverId = d.id),
                          ),
                      ],
                    );
                  },
                ),
              ),
              if (kind == null)
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 4, 20, 4),
                  child: Text(
                    "Bu buyurtmada hozir yetkazishga tayyor mahsulot yo'q",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
                  ),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
                  child: Text(_error!,
                      textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton(
                    onPressed: _driverId != null && kind != null && !_busy ? _save : null,
                    child: _busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                        : Text(_driverId == null ? 'Dastavchikni tanlang' : 'Biriktirish',
                            style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DriverTile extends StatelessWidget {
  final StaffMember driver;
  final int stops;
  final bool selected;
  final VoidCallback onTap;

  const _DriverTile({required this.driver, required this.stops, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? AppColors.primary.withValues(alpha: 0.08) : AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: selected ? AppColors.primary : AppColors.border, width: selected ? 1.6 : 1),
            ),
            child: Row(
              children: [
                EmployeeAvatar(name: driver.fullName, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(driver.fullName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      Text(
                        stops == 0 ? "Topshiriq yo'q" : 'Topshiriqda $stops ta buyurtma',
                        style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                    color: selected ? AppColors.primary : AppColors.gray),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

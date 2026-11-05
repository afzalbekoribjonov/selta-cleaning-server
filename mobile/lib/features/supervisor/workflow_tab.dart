import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/services/warehouse_settings.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../delivery/delivery_buckets.dart' show readyDays;
import '../shared/item_detail_row.dart' show itemMeasurementLabel;
import 'stage_action_buttons.dart';
import 'supervisor_order_sheet.dart';
import 'supervisor_workflow.dart';

/// "Jarayon" — sexdagi har bir mahsulot bosqichi bo'yicha. Nazoratchi
/// mahsulotni keyingi bosqichga o'tkazadi va kim bajarganini belgilaydi.
///
/// Ro'yxat sahifalab chiziladi (30 tadan): mahsulotlar ko'p bo'lsa ham
/// ekran bir zumda ochiladi, ma'lumot esa allaqachon xotirada.
class WorkflowTab extends ConsumerStatefulWidget {
  const WorkflowTab({super.key});

  @override
  ConsumerState<WorkflowTab> createState() => _WorkflowTabState();
}

class _WorkflowTabState extends ConsumerState<WorkflowTab> {
  static const _pageSize = 30;
  String _stage = 'pending';
  String _search = '';
  int _shown = _pageSize;

  void _select(String stage) => setState(() {
        _stage = stage;
        _shown = _pageSize;
      });

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(ordersProvider);
    final orders = ordersAsync.valueOrNull ?? const <Order>[];
    final counts = stageCounts(orders);
    final staff = ref.watch(supervisorStaffProvider(dateKeyOf(DateTime.now()))).valueOrNull ?? const <StaffMember>[];
    final names = {for (final s in staff) s.id: s.fullName};

    final q = _search;
    final all = itemsInStage(orders, _stage).where((w) {
      if (q.isEmpty) return true;
      // "12/3" — aynan shu mahsulot; qolgani buyurtma bo'yicha yoki nomi.
      final number = q.replaceFirst('#', '');
      if (number.contains('/')) return w.subId == number;
      return orderMatchesQuery(w.order, q) || w.item.name.toLowerCase().contains(q);
    }).toList();
    final visible = all.take(_shown).toList();
    final stage = kWorkflowStages.firstWhere((s) => s.key == _stage);

    return Column(
      children: [
        SizedBox(
          height: 92,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            children: [
              for (final s in kWorkflowStages) ...[
                _StageTile(stage: s, count: counts[s.key] ?? 0, selected: s.key == _stage, onTap: () => _select(s.key)),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
          child: TextField(
            onChanged: (v) => setState(() {
              _search = v.trim().toLowerCase();
              _shown = _pageSize;
            }),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: '${stage.label}: mijoz, #raqam yoki mahsulot',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
            ),
          ),
        ),
        Expanded(
          child: ordersAsync.isLoading && orders.isEmpty
              ? const SeltaLoadingView()
              : all.isEmpty
                  ? _Empty(stage: stage, searching: q.isNotEmpty)
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
                      itemCount: visible.length + (all.length > visible.length ? 1 : 0),
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        if (i == visible.length) {
                          return Center(
                            child: OutlinedButton(
                              onPressed: () => setState(() => _shown += _pageSize),
                              child: Text('Yana ko\'rsatish (${all.length - visible.length} ta qoldi)'),
                            ),
                          );
                        }
                        return _WorkCard(work: visible[i], stage: stage, names: names);
                      },
                    ),
        ),
      ],
    );
  }
}

class _StageTile extends StatelessWidget {
  final WorkflowStage stage;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _StageTile({required this.stage, required this.count, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? stage.color : AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          width: 104,
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: selected ? stage.color : AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(stage.icon, size: 18, color: selected ? Colors.white : stage.color),
                  const Spacer(),
                  Text(
                    '$count',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: selected ? Colors.white : AppColors.ink, height: 1),
                  ),
                ],
              ),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  stage.label,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: selected ? Colors.white : AppColors.ink),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WorkCard extends ConsumerWidget {
  final WorkItem work;
  final WorkflowStage stage;
  final Map<String, String> names;

  const _WorkCard({required this.work, required this.stage, required this.names});

  String? _statusLine(WidgetRef ref) {
    final item = work.item;
    switch (item.status) {
      case 'washing':
        final by = names[item.washingBy];
        return by != null ? 'Yuvmoqda: $by' : null;
      case 'packing':
        final by = names[item.washedBy];
        return by != null ? 'Yuvdi: $by' : null;
      case 'returned':
        return item.qcNote != null && item.qcNote!.isNotEmpty ? 'Sabab: ${item.qcNote}' : 'Sifatdan qaytarilgan';
      case 'ready':
        final days = readyDays(item, DateTime.now());
        final threshold = ref.watch(warehouseReadyDaysProvider).valueOrNull ?? kDefaultWarehouseReadyDays;
        final a = work.order.assignment;
        final assigned = a != null && !a.isPickup && (a.itemIds.isEmpty || a.itemIds.contains(item.id));
        return [
          if (days != null) days >= threshold ? 'Omborda · $days kun' : 'Tayyor · $days kun',
          if (assigned) 'Dastavchik: ${a.driverName}',
        ].join(' · ');
      default:
        final due = item.dueDate;
        return due != null ? 'Muddat: ${formatDateUz(due)}' : null;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = work.item;
    final measurement = itemMeasurementLabel(item);
    final statusLine = _statusLine(ref);
    final unmeasured = item.price <= 0;
    final overdue = item.dueDate != null && DateTime.now().isAfter(item.dueDate!);

    // Bosqich rangi — chap chiziq. Yumaloq burchakli ramka faqat bir xil
    // rangda bo'la oladi, shuning uchun chiziq alohida (OrderCard kabi).
    return Material(
      color: AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: () => openSupervisorOrderSheet(context, work.order),
        child: Stack(
          children: [
            Positioned(left: 0, top: 0, bottom: 0, width: 4, child: ColoredBox(color: stage.color)),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(7)),
                        child:
                            Text(work.subId, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppColors.primary)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          item.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.25),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        unmeasured ? "O'lchanmagan" : formatMoneyUz(item.price),
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: unmeasured ? AppColors.danger : AppColors.ink,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [work.order.customerName.isEmpty ? "Noma'lum mijoz" : work.order.customerName, if (measurement.isNotEmpty && !unmeasured) measurement]
                        .join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                  ),
                  if (statusLine != null && statusLine.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      statusLine,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: item.status == 'returned' || (overdue && item.status != 'ready') ? AppColors.danger : stage.color,
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Align(alignment: Alignment.centerRight, child: StageActionButtons(work: work)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final WorkflowStage stage;
  final bool searching;
  const _Empty({required this.stage, required this.searching});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: stage.color.withValues(alpha: 0.1), shape: BoxShape.circle),
              child: Icon(searching ? Icons.search_off_rounded : stage.icon, size: 30, color: stage.color),
            ),
            const SizedBox(height: 12),
            Text(
              searching ? 'Topilmadi' : "${stage.label} bosqichida mahsulot yo'q",
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/stats_repository.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';

/// Talab: vakolat berilgan xodim bugungi ko'rsatkichlarni ko'ra oladi —
/// har biri o'z kartasida, yonida "Ko'rish" tugmasi bilan (bosilganda
/// aynan o'sha buyurtmalar/mahsulotlar ro'yxati ochiladi).
class DailyStatsScreen extends ConsumerWidget {
  const DailyStatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(dailyStatsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kunlik ko\'rsatkichlar'),
        actions: [
          IconButton(
            onPressed: () => ref.invalidate(dailyStatsProvider),
            tooltip: 'Yangilash',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: statsAsync.when(
        loading: () => const SeltaLoadingView(),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline_rounded, size: 44, color: AppColors.danger),
                const SizedBox(height: 12),
                Text(
                  describeApiError(e),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () => ref.invalidate(dailyStatsProvider),
                  child: const Text('Qayta urinish'),
                ),
              ],
            ),
          ),
        ),
        data: (stats) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(dailyStatsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              _TodayHeader(date: stats.date),
              const SizedBox(height: 16),

              // Eng muhim ko'rsatkich — pul, shuning uchun birinchi va
              // alohida (kattaroq) kartada.
              _CashCard(stats: stats),
              const SizedBox(height: 12),

              _StatCard(
                icon: Icons.warehouse_rounded,
                color: AppColors.primary,
                label: 'Bugun sexga keldi',
                value: '${stats.broughtInCount} ta buyurtma',
                entries: stats.broughtIn,
                emptyText: 'Bugun hali sexga buyurtma kelmadi',
                detailTitle: 'Bugun sexga kelgan buyurtmalar',
              ),
              const SizedBox(height: 12),

              _StatCard(
                icon: Icons.local_laundry_service_rounded,
                color: AppColors.info,
                label: 'Bugun yuvildi',
                value: stats.washedTotals.isEmpty
                    ? '0'
                    : stats.washedTotals
                        .map((t) => '${_trimNum(t.amount)} ${t.unit}')
                        .join(' · '),
                subValue: '${stats.washedCount} ta mahsulot',
                entries: stats.washed,
                emptyText: 'Bugun hali mahsulot yuvilmadi',
                detailTitle: 'Bugun yuvilgan mahsulotlar',
              ),
              const SizedBox(height: 12),

              _StatCard(
                icon: Icons.local_shipping_rounded,
                color: AppColors.success,
                label: 'Bugun yetgazildi',
                value: '${stats.deliveredCount} ta buyurtma',
                entries: stats.delivered,
                emptyText: 'Bugun hali buyurtma yetkazilmadi',
                detailTitle: 'Bugun yetkazilgan buyurtmalar',
              ),
              const SizedBox(height: 20),

              const _SectionLabel('Joriy holat'),
              const SizedBox(height: 10),

              _StatCard(
                icon: Icons.water_drop_rounded,
                color: AppColors.info,
                label: 'Hozir yuvilmoqda',
                value: '${stats.washingCount} ta mahsulot',
                subValue: '${stats.washingOrderCount} ta buyurtmada',
                entries: stats.washing,
                emptyText: 'Hozir yuvilayotgan mahsulot yo\'q',
                detailTitle: 'Hozir yuvilayotgan mahsulotlar',
              ),
              const SizedBox(height: 12),

              _StatCard(
                icon: Icons.inventory_2_rounded,
                color: AppColors.success,
                label: 'Yetgazishga tayyor',
                value: '${stats.readyCount} ta mahsulot',
                subValue: '${stats.readyOrderCount} ta buyurtmada',
                entries: stats.ready,
                emptyText: 'Yetgazishga tayyor mahsulot yo\'q',
                detailTitle: 'Yetgazishga tayyor mahsulotlar',
              ),
              const SizedBox(height: 12),

              _StatCard(
                icon: Icons.straighten_rounded,
                color: AppColors.danger,
                label: "O'lchanmagan buyurtmalar",
                value: '${stats.unmeasuredCount} ta buyurtma',
                subValue: stats.unmeasuredCount > 0 ? "Narxi 0 so'm — o'lchash kerak" : null,
                entries: stats.unmeasured,
                emptyText: "Hamma mahsulot o'lchangan",
                detailTitle: "O'lchanmagan mahsulotli buyurtmalar",
                highlight: stats.unmeasuredCount > 0,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _trimNum(num v) {
  if (v == v.roundToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(1);
}

class _TodayHeader extends StatelessWidget {
  final String date;
  const _TodayHeader({required this.date});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(gradient: heroGradient, borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: [
          const Icon(Icons.today_rounded, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Bugungi holat',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
          Text(
            date,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: AppColors.gray, letterSpacing: 0.6),
    );
  }
}

/// Dastavchiklar bugun yig'gan, kassaga topshirilishi kerak bo'lgan summa.
class _CashCard extends StatelessWidget {
  final DailyStats stats;
  const _CashCard({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.success.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.payments_rounded, color: AppColors.success, size: 20),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Dastavchiklar topshirishi kerak',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: AppColors.ink),
                ),
              ),
              if (stats.cashEntries.isNotEmpty)
                _ViewButton(
                  title: 'Bugun yig\'ilgan summa',
                  entries: stats.cashEntries,
                  emptyText: '',
                  color: AppColors.success,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            formatMoneyUz(stats.cashTotal),
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 26, color: AppColors.success),
          ),
          const SizedBox(height: 2),
          const Text(
            'Bugun yetkazilgan buyurtmalardan',
            style: TextStyle(fontSize: 11.5, color: AppColors.grayDark, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final String value;
  final String? subValue;
  final List<StatEntry> entries;
  final String emptyText;
  final String detailTitle;
  final bool highlight;

  const _StatCard({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    required this.entries,
    required this.emptyText,
    required this.detailTitle,
    this.subValue,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: highlight ? AppColors.danger.withValues(alpha: 0.45) : AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(13)),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: highlight ? AppColors.danger : AppColors.ink),
                ),
                if (subValue != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subValue!,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: highlight ? AppColors.danger : AppColors.gray,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (entries.isNotEmpty)
            _ViewButton(title: detailTitle, entries: entries, emptyText: emptyText, color: color),
        ],
      ),
    );
  }
}

class _ViewButton extends StatelessWidget {
  final String title;
  final List<StatEntry> entries;
  final String emptyText;
  final Color color;

  const _ViewButton({required this.title, required this.entries, required this.emptyText, required this.color});

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _EntriesSheet(title: title, entries: entries, emptyText: emptyText),
      ),
      style: TextButton.styleFrom(
        foregroundColor: color,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: const Text("Ko'rish", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
    );
  }
}

class _EntriesSheet extends StatelessWidget {
  final String title;
  final List<StatEntry> entries;
  final String emptyText;

  const _EntriesSheet({required this.title, required this.entries, required this.emptyText});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.bg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
                child: Row(
                  children: [
                    Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${entries.length} ta',
                        style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: entries.isEmpty
                    ? Center(child: Text(emptyText, style: const TextStyle(color: AppColors.gray)))
                    : ListView.separated(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        itemCount: entries.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, i) => _EntryTile(entry: entries[i]),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _EntryTile extends StatelessWidget {
  final StatEntry entry;
  const _EntryTile({required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Text(
              '#${entry.orderNumber}',
              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w900, fontSize: 12),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.customerName.isEmpty ? "Noma'lum mijoz" : entry.customerName,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
                ),
                if (entry.itemName != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    entry.itemName!,
                    style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w500),
                  ),
                ] else if (entry.phone != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    entry.phone!,
                    style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w500),
                  ),
                ],
              ],
            ),
          ),
          if (entry.amount != null)
            Text(
              formatMoneyUz(entry.amount!),
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: AppColors.success),
            )
          else if (entry.qty != null && entry.qty! > 0)
            Text(
              _qtyLabel(entry),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.grayDark),
            ),
        ],
      ),
    );
  }

  static String _qtyLabel(StatEntry e) {
    final unit = switch (e.calcType) {
      'sqm' => 'm²',
      'meter' => 'metr',
      'kg' => 'kg',
      _ => 'dona',
    };
    final q = e.qty!;
    final text = q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(1);
    return '$text $unit';
  }
}

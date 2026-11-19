import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/expenses_repository.dart';
import '../../core/services/my_activity_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/sync/action_queue.dart';
import '../../core/sync/pending_action.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../../core/widgets/uz_date_range_sheet.dart';
import 'add_expense_sheet.dart';

/// Navbatdagi chiqim serverga yetib borgach "Bugungi ish" qayta olinadi —
/// aks holda navbatdan chiqqan chiqim ro'yxatdan bir muddat yo'qolib qolardi.
void listenExpenseSync(WidgetRef ref) {
  ref.listen<List<PendingAction>>(actionQueueProvider, (previous, next) {
    bool acked(PendingAction a) => a.path == kAddExpensePath && a.acked;
    final before = {
      for (final a in previous ?? const <PendingAction>[])
        if (acked(a)) a.id
    };
    if (next.any((a) => acked(a) && !before.contains(a.id))) {
      ref.invalidate(myDailyActivityProvider);
      ref.invalidate(myExpensesProvider);
    }
  });
}

/// "Chiqimlar" — xodimning o'z chiqimlari OY va KUN bo'yicha: o'zbekcha
/// kalendar (har bir kunda summa), kunlik diagramma, kun bo'yicha ro'yxat va
/// istalgan davrni tanlash. Bugun tanlangan davrda bo'lsa — qo'ldagi naqd.
class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});

  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTimeRange? _custom;
  String? _selectedDay;

  DateTimeRange get _range => _custom ?? monthRangeOf(_month);

  void _shiftMonth(int delta) => setState(() {
        _month = DateTime(_month.year, _month.month + delta);
        _custom = null;
        _selectedDay = null;
      });

  Future<void> _pickRange() async {
    final picked = await showUzDateRangeSheet(context, initial: _range);
    if (picked == null || !mounted) return;
    setState(() {
      final isWholeMonth = picked.start.day == 1 &&
          picked.start.month == picked.end.month &&
          picked.start.year == picked.end.year &&
          monthRangeOf(picked.start).end == picked.end;
      _month = DateTime(picked.end.year, picked.end.month);
      _custom = isWholeMonth ? null : picked;
      _selectedDay = null;
    });
  }

  Future<void> _delete(ExpenseEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Chiqim o'chirilsinmi?"),
        content: Text('${e.name} — ${formatMoneyUz(e.amount)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text("O'chirish"),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(expensesRepositoryProvider).delete(e);
      if (!e.pending) {
        ref.invalidate(myDailyActivityProvider);
        ref.invalidate(myExpensesProvider);
      }
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err))));
    }
  }

  @override
  Widget build(BuildContext context) {
    listenExpenseSync(ref);
    final range = _range;
    final key = (from: dateKeyOf(range.start), to: dateKeyOf(range.end));
    final today = dateKeyOf(DateTime.now());
    final includesToday = key.from.compareTo(today) <= 0 && key.to.compareTo(today) >= 0;

    final async = ref.watch(myExpensesProvider(key));
    final queue = ref.watch(actionQueueProvider);
    // Navbatdagilar (hali yuborilmagan) — bugungi kunda.
    final expenses = mergeExpenses(async.valueOrNull ?? const [], includesToday ? queue : const []);
    final valid = expenses.where((e) => !e.failed).toList();
    final byDay = <String, List<ExpenseEntry>>{};
    for (final e in expenses) {
      byDay.putIfAbsent(e.dayKey, () => []).add(e);
    }
    final dayTotals = {
      for (final entry in byDay.entries) entry.key: entry.value.where((e) => !e.failed).fold<num>(0, (s, e) => s + e.amount)
    };

    final activity = includesToday ? ref.watch(myDailyActivityProvider).valueOrNull : null;
    final todayExpenses = byDay[today] ?? const [];
    final cash = activity == null ? null : cashInHand(activity.collectedCash, todayExpenses);

    final listDays = (_selectedDay != null ? [_selectedDay!] : byDay.keys.toList())..sort((a, b) => b.compareTo(a));

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(title: const Text('Chiqimlar')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myExpensesProvider(key));
          if (includesToday) ref.invalidate(myDailyActivityProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            _PeriodBar(
              title: _custom == null ? '${kUzMonths[_month.month - 1]} ${_month.year}' : formatUzRange(_custom!),
              isCustom: _custom != null,
              canNext: _custom == null &&
                  DateTime(_month.year, _month.month + 1).isBefore(DateTime(DateTime.now().year, DateTime.now().month + 1)),
              onPrev: () => _shiftMonth(-1),
              onNext: () => _shiftMonth(1),
              onCalendar: _pickRange,
              onClearCustom: () => setState(() {
                _custom = null;
                _selectedDay = null;
              }),
            ),
            const SizedBox(height: 12),
            _SummaryHero(
              total: valid.fold<num>(0, (s, e) => s + e.amount),
              count: valid.length,
              fromCash: valid.where((e) => e.fromCash).fold<num>(0, (s, e) => s + e.amount),
              cash: cash,
            ),
            if (async.hasError && async.valueOrNull == null) ...[
              const SizedBox(height: 10),
              _Notice(text: describeApiError(async.error!), onRetry: () => ref.invalidate(myExpensesProvider(key))),
            ],
            const SizedBox(height: 14),
            if (async.isLoading && async.valueOrNull == null)
              const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: SeltaLoader(size: 36)))
            else ...[
              MediaQuery.withClampedTextScaling(
                maxScaleFactor: 1.15,
                child: _DailyBars(
                  range: range,
                  totals: dayTotals,
                  selected: _selectedDay,
                  onSelect: (d) => setState(() => _selectedDay = _selectedDay == d ? null : d),
                ),
              ),
              if (_custom == null) ...[
                const SizedBox(height: 12),
                MediaQuery.withClampedTextScaling(
                  maxScaleFactor: 1.15,
                  child: _MonthCalendar(
                    month: _month,
                    totals: dayTotals,
                    selected: _selectedDay,
                    onSelect: (d) => setState(() => _selectedDay = _selectedDay == d ? null : d),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _selectedDay == null ? 'Kunlar bo\'yicha' : formatWeekdayDateUz(DateTime.parse(_selectedDay!)),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.ink),
                    ),
                  ),
                  if (_selectedDay != null)
                    TextButton.icon(
                      onPressed: () => setState(() => _selectedDay = null),
                      icon: const Icon(Icons.close_rounded, size: 16),
                      label: const Text('Hammasi', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              if (expenses.isEmpty || (_selectedDay != null && (byDay[_selectedDay!] ?? const []).isEmpty))
                const _EmptyList()
              else
                for (final day in listDays) ...[
                  _DayHeader(dayKey: day, total: dayTotals[day] ?? 0, count: (byDay[day] ?? const []).length),
                  for (final e in byDay[day] ?? const <ExpenseEntry>[]) ...[
                    _ExpenseTile(expense: e, onDelete: day == today ? () => _delete(e) : null),
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 6),
                ],
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            onPressed: () async {
              final saved = await openAddExpenseSheet(context);
              if (saved == true && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Chiqim saqlandi')));
              }
            },
            icon: const Icon(Icons.add_rounded),
            label: const Text("Chiqim qo'shish", style: TextStyle(fontWeight: FontWeight.w800)),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Kalendar katagi uchun qisqa summa: "850", "150k", "1,2 mln".
String compactMoney(num value) {
  final v = value.abs();
  String trim(double x) => (x >= 10 ? x.toStringAsFixed(0) : x.toStringAsFixed(1)).replaceAll(RegExp(r'\.0$'), '').replaceAll('.', ',');
  if (v >= 1000000) return '${trim(v / 1000000)} mln';
  if (v >= 1000) return '${trim(v / 1000)}k';
  return '${v.round()}';
}

class _PeriodBar extends StatelessWidget {
  final String title;
  final bool isCustom;
  final bool canNext;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onCalendar;
  final VoidCallback onClearCustom;

  const _PeriodBar({
    required this.title,
    required this.isCustom,
    required this.canNext,
    required this.onPrev,
    required this.onNext,
    required this.onCalendar,
    required this.onClearCustom,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          if (!isCustom)
            IconButton(tooltip: 'Oldingi oy', onPressed: onPrev, icon: const Icon(Icons.chevron_left_rounded))
          else
            IconButton(tooltip: 'Oyga qaytish', onPressed: onClearCustom, icon: const Icon(Icons.close_rounded)),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onCalendar,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.calendar_month_rounded, size: 18, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: AppColors.ink),
                    ),
                  ),
                  const Icon(Icons.expand_more_rounded, size: 20, color: AppColors.grayDark),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Keyingi oy',
            onPressed: canNext ? onNext : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

class _SummaryHero extends StatelessWidget {
  final num total;
  final int count;
  final num fromCash;
  final ({num collected, num cashExpenses, num inHand})? cash;

  const _SummaryHero({required this.total, required this.count, required this.fromCash, required this.cash});

  @override
  Widget build(BuildContext context) {
    final cash = this.cash;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFB42318), Color(0xFFE5484D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [BoxShadow(color: AppColors.danger.withValues(alpha: 0.25), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            count == 0 ? 'Chiqim kiritilmagan' : 'Jami chiqim · $count ta',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(formatMoneyUz(total), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _HeroStat(label: 'Naqddan', value: formatMoneyUz(fromCash))),
              const SizedBox(width: 10),
              Expanded(child: _HeroStat(label: "O'z hisobidan", value: formatMoneyUz(total - fromCash))),
            ],
          ),
          if (cash != null && (cash.cashExpenses > 0 || cash.collected > 0)) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: [
                  const Icon(Icons.account_balance_wallet_rounded, color: AppColors.ink, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      cash.inHand < 0 ? 'Bugun sizga qaytariladi' : 'Bugun topshirasiz',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Text(
                        formatMoneyUz(cash.inHand.abs()),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.ink),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  final String label;
  final String value;
  const _HeroStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5, fontWeight: FontWeight.w700)),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }
}

/// Kunlik diagramma — har bir kun bitta ustun; bosilgan kun ro'yxatni filtrlaydi.
class _DailyBars extends StatelessWidget {
  final DateTimeRange range;
  final Map<String, num> totals;
  final String? selected;
  final ValueChanged<String> onSelect;

  const _DailyBars({required this.range, required this.totals, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    final days = <DateTime>[];
    for (var d = range.start; !d.isAfter(range.end); d = DateTime(d.year, d.month, d.day + 1)) {
      days.add(d);
    }
    final maxValue = totals.values.fold<num>(0, max);
    final today = dateKeyOf(DateTime.now());
    const barArea = 96.0;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Kunlik chiqimlar', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.ink)),
              ),
              if (maxValue > 0)
                Flexible(
                  child: Text(
                    'eng ko\'pi ${compactMoney(maxValue)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.grayDark),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: barArea + 20,
            child: LayoutBuilder(builder: (context, constraints) {
              final slot = max(10.0, constraints.maxWidth / days.length);
              final scrollable = slot * days.length > constraints.maxWidth + 1;
              final row = Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final d in days)
                    Builder(builder: (context) {
                      final key = dateKeyOf(d);
                      final value = totals[key] ?? 0;
                      final h = maxValue > 0 ? max(value > 0 ? 4.0 : 2.0, barArea * value / maxValue) : 2.0;
                      final isSelected = selected == key;
                      final showLabel = days.length <= 10 || d.day == 1 || d.day % 5 == 0 || key == today;
                      return GestureDetector(
                        onTap: () => onSelect(key),
                        child: SizedBox(
                          width: slot,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 220),
                                height: h,
                                margin: EdgeInsets.symmetric(horizontal: slot > 14 ? 2 : 1),
                                decoration: BoxDecoration(
                                  color: value == 0
                                      ? AppColors.border
                                      : isSelected
                                          ? AppColors.danger
                                          : AppColors.danger.withValues(alpha: selected == null ? 0.75 : 0.35),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                              const SizedBox(height: 4),
                              SizedBox(
                                height: 14,
                                child: showLabel
                                    ? FittedBox(
                                        child: Text(
                                          '${d.day}',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: isSelected || key == today ? FontWeight.w900 : FontWeight.w600,
                                            color: isSelected ? AppColors.danger : AppColors.grayDark,
                                          ),
                                        ),
                                      )
                                    : null,
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                ],
              );
              return scrollable ? SingleChildScrollView(scrollDirection: Axis.horizontal, reverse: true, child: row) : row;
            }),
          ),
        ],
      ),
    );
  }
}

/// O'zbekcha oy kalendari — har bir kunda o'sha kungi chiqim summasi.
class _MonthCalendar extends StatelessWidget {
  final DateTime month;
  final Map<String, num> totals;
  final String? selected;
  final ValueChanged<String> onSelect;

  const _MonthCalendar({required this.month, required this.totals, required this.selected, required this.onSelect});

  static const _weekdays = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final offset = first.weekday - 1;
    final rows = ((offset + daysInMonth) / 7).ceil();
    final today = DateTime.now();
    final maxValue = totals.values.fold<num>(0, max);

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              for (final w in _weekdays)
                Expanded(
                  child: Center(
                    child: Text(
                      w,
                      style:
                          TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: w == 'Ya' ? AppColors.danger : AppColors.grayDark),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          for (var r = 0; r < rows; r++)
            Row(
              children: [
                for (var c = 0; c < 7; c++)
                  Expanded(
                    child: Builder(builder: (context) {
                      final index = r * 7 + c - offset;
                      if (index < 0 || index >= daysInMonth) return const SizedBox(height: 50);
                      final day = DateTime(month.year, month.month, index + 1);
                      final key = dateKeyOf(day);
                      final value = totals[key] ?? 0;
                      final future = day.isAfter(today);
                      final isToday = day.year == today.year && day.month == today.month && day.day == today.day;
                      final isSelected = selected == key;
                      final intensity = maxValue > 0 && value > 0 ? 0.08 + 0.22 * (value / maxValue) : 0.0;
                      return GestureDetector(
                        onTap: future ? null : () => onSelect(key),
                        child: Container(
                          height: 50,
                          margin: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            color: isSelected ? AppColors.danger : AppColors.danger.withValues(alpha: intensity),
                            borderRadius: BorderRadius.circular(12),
                            border: isToday && !isSelected ? Border.all(color: AppColors.primary, width: 1.5) : null,
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '${day.day}',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: isToday || isSelected ? FontWeight.w900 : FontWeight.w700,
                                    color: isSelected
                                        ? Colors.white
                                        : future
                                            ? AppColors.border
                                            : c == 6
                                                ? AppColors.danger
                                                : AppColors.ink,
                                  ),
                                ),
                                if (value > 0)
                                  FittedBox(
                                    fit: BoxFit.scaleDown,
                                    child: Text(
                                      compactMoney(value),
                                      style: TextStyle(
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w900,
                                        color: isSelected ? Colors.white : AppColors.danger,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _DayHeader extends StatelessWidget {
  final String dayKey;
  final num total;
  final int count;
  const _DayHeader({required this.dayKey, required this.total, required this.count});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              formatWeekdayDateUz(DateTime.parse(dayKey)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.grayDark),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(
                      text: '$count ta · ', style: const TextStyle(fontSize: 12.5, color: AppColors.gray, fontWeight: FontWeight.w700)),
                  TextSpan(
                      text: formatMoneyUz(total),
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.danger)),
                ]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  final String text;
  final VoidCallback onRetry;
  const _Notice({required this.text, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5, color: AppColors.danger, fontWeight: FontWeight.w600))),
        TextButton(onPressed: onRetry, child: const Text('Qayta urinish')),
      ],
    );
  }
}

class _EmptyList extends StatelessWidget {
  const _EmptyList();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          Icon(Icons.receipt_long_rounded, size: 42, color: AppColors.gray),
          SizedBox(height: 10),
          Text("Bu davrda chiqim yo'q", style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ExpenseTile extends StatelessWidget {
  final ExpenseEntry expense;

  /// Faqat bugungi chiqimni o'chirish mumkin (server ham tekshiradi).
  final VoidCallback? onDelete;

  const _ExpenseTile({required this.expense, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final e = expense;
    final details = [
      if (e.at != null) formatTimeHm(e.at!),
      if (e.note != null && e.note!.isNotEmpty) e.note!,
    ].join(' · ');

    return Container(
      padding: EdgeInsets.fromLTRB(12, 10, onDelete == null ? 12 : 4, 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: e.failed ? AppColors.danger.withValues(alpha: 0.5) : AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
            child: Icon(expenseIcon(e.name), size: 20, color: AppColors.danger),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                if (details.isNotEmpty)
                  Text(
                    details,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark, fontWeight: FontWeight.w500),
                  ),
                if (e.fromCash || e.pending)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (e.fromCash) const _Badge(text: 'Naqddan', color: AppColors.warning),
                        if (e.failed)
                          _Badge(text: e.error!, color: AppColors.danger)
                        else if (e.pending)
                          const _Badge(text: 'Yuborilmoqda', color: AppColors.grayDark),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 120),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                formatMoneyUz(e.amount),
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                  color: e.failed ? AppColors.gray : AppColors.danger,
                  decoration: e.failed ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
          ),
          if (onDelete != null)
            IconButton(
              onPressed: onDelete,
              tooltip: "O'chirish",
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.delete_outline_rounded, size: 20, color: AppColors.grayDark),
            ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;

  const _Badge({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
      child: Text(text,
          maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

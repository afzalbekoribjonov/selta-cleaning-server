import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/expenses_repository.dart';
import '../../core/services/my_activity_repository.dart';
import '../../core/sync/action_queue.dart';
import '../../core/sync/pending_action.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';
import 'add_expense_sheet.dart';

/// Navbatdagi chiqim serverga yetib borgach "Bugungi ish" qayta olinadi —
/// aks holda navbatdan chiqqan chiqim ro'yxatdan bir muddat yo'qolib qolardi.
void listenExpenseSync(WidgetRef ref) {
  ref.listen<List<PendingAction>>(actionQueueProvider, (previous, next) {
    bool acked(PendingAction a) => a.path == kAddExpensePath && a.acked;
    final before = {for (final a in previous ?? const <PendingAction>[]) if (acked(a)) a.id};
    if (next.any((a) => acked(a) && !before.contains(a.id))) ref.invalidate(myDailyActivityProvider);
  });
}

/// Xodimning bugungi chiqimlari va "Chiqim qo'shish" (⋮ menyudan,
/// faqat admin `canAddExpenses` vakolatini berganlarga).
class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    listenExpenseSync(ref);
    final async = ref.watch(myDailyActivityProvider);
    final queue = ref.watch(actionQueueProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Chiqimlar')),
      body: async.when(
        loading: () => const Center(child: SeltaLoader(size: 36)),
        // Serverdagi ro'yxat olinmasa ham navbatdagilar ko'rinadi.
        error: (err, _) => _ExpenseList(
          expenses: mergeExpenses(const [], queue),
          collectedCash: null,
          notice: describeApiError(err),
          onRetry: () => ref.invalidate(myDailyActivityProvider),
        ),
        data: (a) => _ExpenseList(
          expenses: mergeExpenses(a.expenses, queue),
          collectedCash: a.collectedCash,
          onRetry: () => ref.invalidate(myDailyActivityProvider),
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

class _ExpenseList extends ConsumerWidget {
  final List<ExpenseEntry> expenses;

  /// `null` — server hisobi olinmadi (qo'ldagi naqd ko'rsatilmaydi).
  final num? collectedCash;
  final String? notice;
  final VoidCallback onRetry;

  const _ExpenseList({required this.expenses, required this.collectedCash, required this.onRetry, this.notice});

  Future<void> _delete(BuildContext context, WidgetRef ref, ExpenseEntry e) async {
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
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(expensesRepositoryProvider).delete(e);
      if (!e.pending) ref.invalidate(myDailyActivityProvider);
    } catch (err) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err))));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final valid = expenses.where((e) => !e.failed);
    final total = valid.fold<num>(0, (s, e) => s + e.amount);
    final cash = collectedCash == null ? null : cashInHand(collectedCash!, expenses);

    return RefreshIndicator(
      onRefresh: () async => onRetry(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          _SummaryCard(count: valid.length, total: total, cash: cash),
          if (notice != null) ...[
            const SizedBox(height: 10),
            Text(notice!, style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 14),
          if (expenses.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  Icon(Icons.receipt_long_rounded, size: 42, color: AppColors.gray),
                  SizedBox(height: 10),
                  Text('Bugun chiqim kiritilmagan', style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600)),
                ],
              ),
            )
          else
            for (final e in expenses) ...[
              _ExpenseTile(expense: e, onDelete: () => _delete(context, ref, e)),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final int count;
  final num total;
  final ({num collected, num cashExpenses, num inHand})? cash;

  const _SummaryCard({required this.count, required this.total, required this.cash});

  @override
  Widget build(BuildContext context) {
    final cash = this.cash;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            count == 0 ? 'Bugungi chiqimlar' : 'Bugungi chiqimlar · $count ta',
            style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatMoneyUz(total),
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: AppColors.danger),
            ),
          ),
          if (cash != null && (cash.cashExpenses > 0 || cash.collected > 0)) ...[
            const Divider(height: 22, color: AppColors.border),
            _Line(label: "Yig'ilgan naqd", value: formatMoneyUz(cash.collected)),
            if (cash.cashExpenses > 0) _Line(label: 'Naqddan chiqim', value: formatMoneyUz(-cash.cashExpenses), color: AppColors.danger),
            _Line(
              label: cash.inHand < 0 ? 'Sizga qaytariladi' : 'Topshirasiz',
              value: formatMoneyUz(cash.inHand.abs()),
              strong: true,
            ),
          ],
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final bool strong;

  const _Line({required this.label, required this.value, this.color = AppColors.ink, this.strong = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: strong ? AppColors.ink : AppColors.grayDark, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 8),
          // Katta summa + katta shriftda ham qator sig'adi — raqam kichrayadi.
          Expanded(
            flex: 4,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(value, style: TextStyle(fontSize: strong ? 15 : 13.5, fontWeight: FontWeight.w900, color: color)),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExpenseTile extends StatelessWidget {
  final ExpenseEntry expense;
  final VoidCallback onDelete;

  const _ExpenseTile({required this.expense, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final e = expense;
    final details = [
      if (e.at != null) formatTimeHm(e.at!),
      if (e.note != null && e.note!.isNotEmpty) e.note!,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
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
                Text(
                  e.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
                if (details.isNotEmpty)
                  Text(
                    details,
                    maxLines: 1,
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
      child: Text(
        text,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}

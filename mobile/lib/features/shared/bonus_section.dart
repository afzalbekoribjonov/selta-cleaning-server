import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/employee_summary.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/bonus_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/utils/money_utils.dart';

/// Telefonning oxirgi 9 raqami — server mijozni shu bo'yicha taniydi.
String? bonusPhoneKey(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  return digits.length >= 9 ? digits.substring(digits.length - 9) : null;
}

/// Bonusni buyurtmaga qo'llay oladiganlar — mijozdan to'lov oladiganlar
/// (server ham aynan shuni tekshiradi: routes/bonus.ts).
bool canApplyBonus(Map<String, dynamic>? employee, EmployeeClaims? claims, Order order) {
  final role = claims?.role;
  if (role == 'admin' || role == 'delivery' || role == 'dispatcher') return true;
  if (order.serviceType == 'onsite' && claims != null && order.assignedTeam.contains(claims.employeeId)) return true;
  return employee?['canTakePrepayment'] == true || employee?['canAccessWarehouse'] == true;
}

/// "Bonus (keshbek)" — buyurtma ichki kartasida.
///
/// To'lov oladigan xodim mijozning bonus hisobini ko'radi va mijoz rozi
/// bo'lsa "Bonusni ishlatish" bilan uni buyurtma narxidan ayiradi.
/// Qo'llangan bonus va yakunda berilgan keshbek hammaga ko'rinadi.
/// Ko'rsatadigan narsa bo'lmasa bo'lim umuman chiqmaydi.
class BonusSection extends ConsumerWidget {
  final Order order;
  const BonusSection({super.key, required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claims = ref.watch(employeeClaimsProvider).valueOrNull;
    final employee = ref.watch(currentEmployeeProvider).valueOrNull;
    final key = bonusPhoneKey(order.phone);
    final canApply = key != null && !order.isDone && canApplyBonus(employee, claims, order);
    // Hisob faqat ishlata oladiganlar uchun so'raladi — boshqalarga keraksiz so'rov.
    final bonusAsync = canApply ? ref.watch(customerBonusProvider(key)) : null;
    final balance = bonusAsync?.valueOrNull?.balance ?? 0;
    final earned = order.bonusEarned ?? 0;
    final hasEntries = order.bonusEntries.isNotEmpty;

    final showBalance = bonusAsync != null && (balance > 0 || bonusAsync.hasError);
    if (!hasEntries && earned <= 0 && !showBalance) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.accent.withValues(alpha: 0.6)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(Icons.card_giftcard_rounded, size: 20, color: AppColors.warning),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Bonus (keshbek)',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                  ),
                ),
              ],
            ),
            if (earned > 0) ...[
              const SizedBox(height: 6),
              _Line(label: 'Mijozga berildi', value: '+${formatMoneyUz(earned)}', color: AppColors.success),
            ],
            for (final use in order.bonusEntries)
              _UseRow(
                order: order,
                use: use,
                phoneKey: key,
                canUndo: !order.isDone && (claims?.employeeId == use.employeeId),
              ),
            if (bonusAsync != null)
              bonusAsync.when(
                skipLoadingOnRefresh: true,
                loading: () => const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: LinearProgressIndicator(minHeight: 2),
                ),
                error: (_, __) => const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    "Mijoz bonusini ko'rish uchun internet kerak",
                    style: TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                  ),
                ),
                data: (bonus) => bonus.balance <= 0
                    ? const SizedBox.shrink()
                    : _ApplyBlock(order: order, balance: bonus.balance, phoneKey: key!),
              ),
          ],
        ),
      ),
    );
  }
}

class _ApplyBlock extends ConsumerStatefulWidget {
  final Order order;
  final num balance;
  final String phoneKey;

  const _ApplyBlock({required this.order, required this.balance, required this.phoneKey});

  @override
  ConsumerState<_ApplyBlock> createState() => _ApplyBlockState();
}

class _ApplyBlockState extends ConsumerState<_ApplyBlock> {
  bool _busy = false;

  Future<void> _apply() async {
    final balance = widget.balance;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Bonusni ishlatish'),
        content: Text(
          'Mijozda ${formatMoneyUz(balance)} bonus bor. Buyurtma narxidan ayirilsinmi?\n\n'
          "To'lanmagan qismdan ko'p ayirilmaydi — qolgani mijoz hisobida qoladi.",
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Ishlatish')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final applied = await ref.read(bonusServiceProvider).apply(
            orderId: widget.order.id,
            actorName: ref.read(currentEmployeeProvider).valueOrNull?['fullName'] as String?,
          );
      ref.invalidate(customerBonusProvider(widget.phoneKey));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('✅ Bonusdan ${formatMoneyUz(applied)} ayirildi')));
      }
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Narx hali aniqlanmagan (o'lchanmagan) buyurtmadan ayiradigan narsa yo'q.
    final priced = widget.order.totalPrice > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 6),
        _Line(label: 'Mijoz hisobida', value: formatMoneyUz(widget.balance), color: AppColors.warning, strong: true),
        const SizedBox(height: 8),
        FilledButton.tonalIcon(
          onPressed: _busy || !priced ? null : _apply,
          icon: _busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.redeem_rounded, size: 18),
          label: Text(
            priced ? 'Bonusni ishlatish' : 'Narx aniqlangach ishlatiladi',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

class _UseRow extends ConsumerStatefulWidget {
  final Order order;
  final BonusUse use;
  final String? phoneKey;
  final bool canUndo;

  const _UseRow({required this.order, required this.use, required this.phoneKey, required this.canUndo});

  @override
  ConsumerState<_UseRow> createState() => _UseRowState();
}

class _UseRowState extends ConsumerState<_UseRow> {
  bool _busy = false;

  Future<void> _undo() async {
    setState(() => _busy = true);
    try {
      await ref.read(bonusServiceProvider).cancel(orderId: widget.order.id, entryId: widget.use.id);
      if (widget.phoneKey != null) ref.invalidate(customerBonusProvider(widget.phoneKey!));
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final use = widget.use;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Expanded(
            child: _Line(
              label: use.employeeName == null ? 'Bonusdan ayirildi' : 'Bonusdan ayirildi · ${use.employeeName}',
              value: '-${formatMoneyUz(use.amount)}',
            ),
          ),
          if (widget.canUndo)
            _busy
                ? const Padding(
                    padding: EdgeInsets.all(10),
                    child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : IconButton(
                    onPressed: _undo,
                    tooltip: 'Bonusni qaytarish',
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.undo_rounded, size: 20, color: AppColors.grayDark),
                  ),
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
    return Row(
      children: [
        Expanded(
          flex: 5,
          child: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 4,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              value,
              style: TextStyle(fontSize: strong ? 14 : 13, fontWeight: strong ? FontWeight.w900 : FontWeight.w700, color: color),
            ),
          ),
        ),
      ],
    );
  }
}

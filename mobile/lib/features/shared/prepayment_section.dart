import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import 'payment_method_field.dart';

/// "Oldindan to'lov" — buyurtma ichki kartasida (barcha bo'limlarda).
///
/// Ma'lumotni hamma ko'radi: dastavchik topshirishda qancha olishini
/// bilishi kerak. Qabul qilish esa faqat admin "Oldindan to'lov"
/// vakolatini bergan xodimga (server ham tekshiradi). To'lov ham, qoldiq
/// ham bo'lmasa va vakolat ham yo'q bo'lsa — bo'lim umuman chiqmaydi.
///
/// Yuqoridan o'z oralig'i bilan keladi: yashiringanda ortiqcha bo'shliq
/// qolmasligi uchun.
class PrepaymentSection extends ConsumerWidget {
  final Order order;
  const PrepaymentSection({super.key, required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canTake = ref.watch(currentEmployeeProvider).valueOrNull?['canTakePrepayment'] == true;
    final myId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;
    final canAdd = canTake && !order.isDone;
    final hasAny = order.prepaidAmount > 0 || order.prepayments.isNotEmpty;
    if (!hasAny && !canAdd) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: hasAny ? AppColors.success.withValues(alpha: 0.35) : AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.savings_rounded, size: 20, color: AppColors.success),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    "Oldindan to'lov",
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                  ),
                ),
                if (canAdd && hasAny)
                  TextButton.icon(
                    onPressed: () => openAddPrepaymentSheet(context, order),
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text("Qo'shish"),
                    style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                  ),
              ],
            ),
            if (!hasAny) ...[
              const SizedBox(height: 4),
              const Text(
                "Mijoz hali oldindan to'lov qilmagan. Qabul qilingan summa topshirishda narxdan ayiriladi.",
                style: TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 10),
              FilledButton.tonalIcon(
                onPressed: () => openAddPrepaymentSheet(context, order),
                icon: const Icon(Icons.add_card_rounded, size: 18),
                label: const Text("Oldindan to'lov qabul qilish", style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ] else ...[
              const SizedBox(height: 8),
              ..._summary(order),
              for (final p in order.prepayments) ...[
                const Divider(height: 18, color: AppColors.border),
                _PrepaymentRow(
                  order: order,
                  prepayment: p,
                  // Bekor qilish — o'zi qabul qilgan, shu kungi to'lov
                  // (server qolgan shartlarni ham tekshiradi).
                  canCancel: p.employeeId == myId && p.at != null && DateUtils.isSameDay(p.at, DateTime.now()),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  /// Jami, ishlatilgani va topshirishda yana olinadigani.
  static List<Widget> _summary(Order o) {
    final lines = <Widget>[
      _Line(label: "To'langan", value: formatMoneyUz(o.prepaidAmount), color: AppColors.success, strong: true)
    ];
    if (o.prepaidUsed > 0) {
      lines.add(_Line(label: 'Topshirishda hisobga olindi', value: formatMoneyUz(o.prepaidUsed)));
      if (o.prepaidCredit > 0) {
        lines.add(
          o.isDone
              ? _Line(
                  label: 'Ortiqcha — mijozga qaytariladi',
                  value: formatMoneyUz(o.prepaidCredit),
                  color: AppColors.warning,
                  strong: true)
              : _Line(label: 'Qoldiq', value: formatMoneyUz(o.prepaidCredit)),
        );
      }
    } else if (!o.isDone && o.totalPrice > 0) {
      final rest = o.remainingToPay;
      lines.add(
        rest >= 0
            ? _Line(label: 'Topshirishda olinadi', value: formatMoneyUz(rest), strong: true)
            : _Line(label: 'Ortiqcha to\'langan', value: formatMoneyUz(-rest), color: AppColors.warning, strong: true),
      );
    }
    return lines;
  }
}

String _methodLabel(Prepayment p) {
  if (p.cardAmount > 0 && p.cashAmount > 0) return 'Naqd + karta';
  return p.cardAmount > 0 ? 'Karta' : 'Naqd';
}

class _PrepaymentRow extends ConsumerStatefulWidget {
  final Order order;
  final Prepayment prepayment;
  final bool canCancel;

  const _PrepaymentRow({required this.order, required this.prepayment, required this.canCancel});

  @override
  ConsumerState<_PrepaymentRow> createState() => _PrepaymentRowState();
}

class _PrepaymentRowState extends ConsumerState<_PrepaymentRow> {
  bool _busy = false;

  Future<void> _cancel() async {
    final p = widget.prepayment;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("To'lov bekor qilinsinmi?"),
        content: Text("${formatMoneyUz(p.amount)} — ${_methodLabel(p).toLowerCase()}. Bugungi kassa hisobidan ham chiqadi."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Yo\'q')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Bekor qilish'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(ordersRepositoryProvider).cancelPrepayment(orderId: widget.order.id, prepaymentId: p.id);
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(err))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.prepayment;
    final at = p.at;
    final when = at == null ? null : '${formatDateUz(at)}, ${formatTimeHm(at)}';
    final meta = [_methodLabel(p), if (p.employeeName != null) p.employeeName!, if (when != null) when].join(' · ');

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(formatMoneyUz(p.amount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
              const SizedBox(height: 2),
              Text(
                meta,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark, fontWeight: FontWeight.w500),
              ),
              if (p.note != null && p.note!.isNotEmpty)
                Text(
                  p.note!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11.5, color: AppColors.ink, fontWeight: FontWeight.w500),
                ),
            ],
          ),
        ),
        if (widget.canCancel)
          _busy
              ? const Padding(
                  padding: EdgeInsets.all(10),
                  child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : IconButton(
                  onPressed: _cancel,
                  tooltip: "To'lovni bekor qilish",
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.undo_rounded, size: 20, color: AppColors.grayDark),
                ),
      ],
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
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Text(
              label,
              maxLines: 2,
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
                style:
                    TextStyle(fontSize: strong ? 14 : 13, fontWeight: strong ? FontWeight.w900 : FontWeight.w700, color: color),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Oldindan to'lov qabul qilish oynasi — saqlansa `true`.
Future<bool?> openAddPrepaymentSheet(BuildContext context, Order order) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _AddPrepaymentSheet(order: order),
  );
}

class _AddPrepaymentSheet extends ConsumerStatefulWidget {
  final Order order;
  const _AddPrepaymentSheet({required this.order});

  @override
  ConsumerState<_AddPrepaymentSheet> createState() => _AddPrepaymentSheetState();
}

class _AddPrepaymentSheetState extends ConsumerState<_AddPrepaymentSheet> {
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  PaymentSplit? _split;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  int? get _amount {
    final v = int.tryParse(_amountController.text);
    return v == null || v <= 0 ? null : v;
  }

  void _save() {
    final amount = _amount;
    final split = _split;
    if (amount == null) {
      setState(() => _error = 'Summani kiriting');
      return;
    }
    if (split == null) {
      setState(() => _error = "Naqd qismini to'g'ri kiriting");
      return;
    }
    final note = _noteController.text.trim();
    ref.read(ordersRepositoryProvider).addPrepayment(
          order: widget.order,
          amount: amount,
          cashAmount: split.cash,
          cardAmount: split.card,
          note: note.isEmpty ? null : note,
          actorName: ref.read(currentEmployeeProvider).valueOrNull?['fullName'] as String?,
        );
    Navigator.pop(context, true);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("✅ Oldindan to'lov qabul qilindi · ${formatMoneyUz(amount)}")),
    );
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final amount = _amount;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const SizedBox(height: 16),
                Text("Oldindan to'lov", style: Theme.of(context).textTheme.titleLarge),
                Text(
                  'Buyurtma ${order.displayNumber} · ${order.customerName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                ),
                if (order.totalPrice > 0 || order.prepaidAmount > 0) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        if (order.totalPrice > 0) _Line(label: 'Buyurtma summasi', value: formatMoneyUz(order.totalPrice)),
                        if (order.prepaidAmount > 0)
                          _Line(label: "Avval to'langan", value: formatMoneyUz(order.prepaidAmount), color: AppColors.success),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                const Text('Summa', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                const SizedBox(height: 6),
                TextField(
                  controller: _amountController,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
                  onChanged: (_) => setState(() => _error = null),
                  decoration: InputDecoration(
                    hintText: '0',
                    suffixText: "so'm",
                    helperText: amount == null ? null : formatMoneyUz(amount),
                  ),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
                if (amount != null) ...[
                  const SizedBox(height: 10),
                  PaymentMethodField(total: amount, onChanged: (split) => setState(() => _split = split)),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _noteController,
                  maxLength: 300,
                  maxLines: 2,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(labelText: 'Izoh (ixtiyoriy)', counterText: ''),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.success,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('QABUL QILISH', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/money_utils.dart';

/// Kamomad sababi — server bilan bir xil kalitlar (lib/payments.ts).
enum ShortfallKind { partial, debt, discount }

const _kindKeys = {
  ShortfallKind.partial: 'partial',
  ShortfallKind.debt: 'debt',
  ShortfallKind.discount: 'discount',
};

/// Buyurtmani mijozga topshirish va to'lovni qayd etish oynasi.
///
/// Summa MAJBURIY va butun yetkazish uchun BIR MARTA so'raladi — avval
/// har bir mahsulot alohida "yetkazildi" qilinardi va oyna har safar
/// qaytadan chiqardi.
///
/// Kiritilgan summa mahsulotlar narxidan kam bo'lsa, dastavchik farq
/// qayerga ketganini ko'rsatishi shart:
///   Qisman to'landi — mijoz mahsulotning bir qismini oldi, qolganini
///                     olib ketganda to'laydi;
///   Qarz           — hammasini oldi, pul qarzga qoldi;
///   Chegirma       — farq hisobdan chiqariladi.
Future<bool> openDeliveryPaymentSheet(
  BuildContext context, {
  required Order order,
  required List<OrderItem> readyItems,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PaymentSheet(order: order, readyItems: readyItems),
  );
  return result ?? false;
}

class _PaymentSheet extends ConsumerStatefulWidget {
  final Order order;
  final List<OrderItem> readyItems;

  const _PaymentSheet({required this.order, required this.readyItems});

  @override
  ConsumerState<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends ConsumerState<_PaymentSheet> {
  late final Set<String> _selected = widget.readyItems.map((i) => i.id).toSet();
  final _amountController = TextEditingController();
  ShortfallKind? _kind;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  List<OrderItem> get _selectedItems => widget.readyItems.where((i) => _selected.contains(i.id)).toList();

  num get _due => _selectedItems.fold<num>(0, (sum, i) => sum + i.price);

  num get _paid => num.tryParse(_amountController.text.replaceAll(' ', '').replaceAll(',', '.')) ?? -1;

  num get _shortfall {
    final paid = _paid;
    if (paid < 0) return 0;
    final diff = _due - paid;
    return diff > 0 ? diff : 0;
  }

  /// Tanlanmagan (hali yetkazilmagan) mahsulot qoladimi — "Qisman
  /// to'landi" faqat shunda mantiqiy.
  bool get _hasRemaining => _selected.length < widget.readyItems.length || _hasUndeliveredElsewhere;

  bool get _hasUndeliveredElsewhere {
    final counts = widget.order.itemStatusCounts;
    final notDone = counts.entries
        .where((e) => e.key != 'done')
        .fold<int>(0, (sum, e) => sum + e.value);
    return notDone > widget.readyItems.length;
  }

  Future<void> _submit() async {
    final paid = _paid;
    if (paid < 0) {
      setState(() => _error = 'Mijozdan olingan summani kiriting');
      return;
    }
    if (_selected.isEmpty) {
      setState(() => _error = 'Kamida bitta mahsulot tanlang');
      return;
    }
    if (_shortfall > 0 && _kind == null) {
      setState(() => _error = 'Summa kam — sababini tanlang');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final name = ref.read(currentEmployeeProvider).valueOrNull?['fullName'] as String?;
      await ref.read(ordersRepositoryProvider).deliverOrderItems(
            orderId: widget.order.id,
            itemIds: _selected.toList(),
            paidAmount: paid,
            kind: _kind == null ? null : _kindKeys[_kind!],
            actorName: name,
          );
      if (mounted) Navigator.pop(context, true);
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
    final due = _due;
    final paid = _paid;
    final shortfall = _shortfall;
    final amountEntered = paid >= 0;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
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
              Text(
                'Buyurtma #${widget.order.orderNumber}',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.ink),
              ),
              Text(
                widget.order.customerName,
                style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),

              // Bir nechta mahsulot bo'lsa, dastavchik qaysilarini
              // topshirayotganini belgilaydi (qisman yetkazish).
              if (widget.readyItems.length > 1) ...[
                const Text(
                  'Topshirilayotgan mahsulotlar',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink),
                ),
                const SizedBox(height: 6),
                for (final item in widget.readyItems)
                  _ItemCheck(
                    item: item,
                    checked: _selected.contains(item.id),
                    onChanged: (v) => setState(() {
                      if (v) {
                        _selected.add(item.id);
                      } else {
                        _selected.remove(item.id);
                      }
                      _kind = null;
                    }),
                  ),
                const SizedBox(height: 12),
              ],

              _SummaryRow(label: 'To\'lanishi kerak', value: formatMoneyUz(due), bold: true),
              const SizedBox(height: 12),

              const Text(
                'Mijozdan olingan summa',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _amountController,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => setState(() => _kind = null),
                decoration: InputDecoration(
                  hintText: '0',
                  suffixText: "so'm",
                  filled: true,
                  fillColor: AppColors.surface,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                ),
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.ink),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() {
                  _amountController.text = due.round().toString();
                  _kind = null;
                }),
                child: const Text("To'liq summani kiritish", style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),

              if (amountEntered && shortfall > 0) ...[
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withValues(alpha: 0.07),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _SummaryRow(label: 'Kam to\'landi', value: formatMoneyUz(shortfall), tone: AppColors.danger, bold: true),
                      const SizedBox(height: 10),
                      const Text(
                        'Farq qayerga ketdi?',
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.ink),
                      ),
                      const SizedBox(height: 8),
                      if (_hasRemaining)
                        _KindButton(
                          label: "Qisman to'landi",
                          hint: 'Qolgan mahsulotni olib ketganda to\'laydi',
                          tone: AppColors.warning,
                          selected: _kind == ShortfallKind.partial,
                          onTap: () => setState(() => _kind = ShortfallKind.partial),
                        ),
                      _KindButton(
                        label: 'Qarz qilish',
                        hint: 'Mahsulotni oldi, pul qarzga qoldi',
                        tone: AppColors.danger,
                        selected: _kind == ShortfallKind.debt,
                        onTap: () => setState(() => _kind = ShortfallKind.debt),
                      ),
                      _KindButton(
                        label: 'Skidka qilish',
                        hint: 'Farq chegirma sifatida hisobdan chiqadi',
                        tone: AppColors.info,
                        selected: _kind == ShortfallKind.discount,
                        onTap: () => setState(() => _kind = ShortfallKind.discount),
                      ),
                    ],
                  ),
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(
                  _error!,
                  style: const TextStyle(color: AppColors.danger, fontSize: 12.5, fontWeight: FontWeight.w700),
                ),
              ],

              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _submit,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        'Topshirish (${_selected.length} ta)',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItemCheck extends StatelessWidget {
  final OrderItem item;
  final bool checked;
  final ValueChanged<bool> onChanged;

  const _ItemCheck({required this.item, required this.checked, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => onChanged(!checked),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Checkbox(
              value: checked,
              onChanged: (v) => onChanged(v ?? false),
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                item.name,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.ink),
              ),
            ),
            Text(
              formatMoneyUz(item.price),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.grayDark),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? tone;
  final bool bold;

  const _SummaryRow({required this.label, required this.value, this.tone, this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: bold ? 16 : 13.5,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
            color: tone ?? AppColors.ink,
          ),
        ),
      ],
    );
  }
}

class _KindButton extends StatelessWidget {
  final String label;
  final String hint;
  final Color tone;
  final bool selected;
  final VoidCallback onTap;

  const _KindButton({
    required this.label,
    required this.hint,
    required this.tone,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: selected ? tone.withValues(alpha: 0.14) : AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? tone : AppColors.border, width: selected ? 1.6 : 1),
          ),
          child: Row(
            children: [
              Icon(
                selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                size: 18,
                color: selected ? tone : AppColors.gray,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: selected ? tone : AppColors.ink,
                      ),
                    ),
                    Text(hint, style: const TextStyle(fontSize: 11, color: AppColors.grayDark)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

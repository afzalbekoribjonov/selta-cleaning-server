import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/bonus_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/money_utils.dart';
import '../shared/bonus_section.dart';
import '../shared/payment_method_field.dart';

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

  /// Shu oynada qo'llangan bonus — buyurtma nusxasi oyna ochilgandagi
  /// holat, shuning uchun yangi kredit shu yerda qo'shib boriladi.
  num _bonusAdded = 0;
  bool _bonusBusy = false;

  /// Naqd/karta taqsimoti. `null` — aralash usul tanlangan, lekin naqd
  /// qismi hali to'g'ri kiritilmagan.
  PaymentSplit? _split;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  List<OrderItem> get _selectedItems => widget.readyItems.where((i) => _selected.contains(i.id)).toList();

  /// Tanlangan mahsulotlar narxi.
  num get _gross => _selectedItems.fold<num>(0, (sum, i) => sum + i.price);

  /// Oldindan to'langan qoldiqdan shu topshirishga ishlatiladigani —
  /// server ham aynan shunday hisoblaydi (lib/prepayments.ts).
  num get _prepaidApplied {
    final credit = widget.order.prepaidCredit + _bonusAdded;
    final gross = _gross;
    return credit <= 0 || gross <= 0 ? 0 : (credit < gross ? credit : gross);
  }

  /// Mijozdan olinishi kerak bo'lgani.
  num get _due => _gross - _prepaidApplied;

  /// Kiritilgan summa; kiritilmagan bo'lsa -1. Oldindan to'lov hammasini
  /// yopgan bo'lsa bo'sh maydon 0 degani — dastavchik hech narsa olmaydi.
  num get _paid {
    final text = _amountController.text.replaceAll(' ', '').replaceAll(',', '.');
    if (text.isEmpty) return _due == 0 ? 0 : -1;
    return num.tryParse(text) ?? -1;
  }

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

  /// Mijoz rozi bo'lsa bonusi shu topshirishga ishlatiladi (server darhol
  /// tekshiradi va hisobdan yechadi — internet kerak).
  Future<void> _useBonus(String phoneKey, num balance) async {
    setState(() {
      _bonusBusy = true;
      _error = null;
    });
    try {
      final applied = await ref.read(bonusServiceProvider).apply(
            orderId: widget.order.id,
            amount: balance < _due ? balance : _due,
            actorName: ref.read(currentEmployeeProvider).valueOrNull?['fullName'] as String?,
          );
      ref.invalidate(customerBonusProvider(phoneKey));
      if (!mounted) return;
      setState(() {
        _bonusAdded += applied;
        // Summa o'zgardi — kiritilgani qayta tekshirilishi kerak.
        _amountController.clear();
        _kind = null;
      });
    } catch (err) {
      if (mounted) setState(() => _error = describeApiError(err));
    } finally {
      if (mounted) setState(() => _bonusBusy = false);
    }
  }

  /// "Bonusni ishlatish" tugmasi — mijozda bonus bo'lsa va olinadigan
  /// summa qolgan bo'lsa.
  Widget _bonusButton() {
    final key = bonusPhoneKey(widget.order.phone);
    final claims = ref.watch(employeeClaimsProvider).valueOrNull;
    final employee = ref.watch(currentEmployeeProvider).valueOrNull;
    if (key == null || _due <= 0 || !canApplyBonus(employee, claims, widget.order)) return const SizedBox.shrink();
    final balance = ref.watch(customerBonusProvider(key)).valueOrNull?.balance ?? 0;
    if (balance <= 0) return const SizedBox.shrink();
    final use = balance < _due ? balance : _due;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: OutlinedButton.icon(
        onPressed: _bonusBusy ? null : () => _useBonus(key, balance),
        icon: _bonusBusy
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.redeem_rounded, size: 18),
        label: Text(
          'Bonusni ishlatish · ${formatMoneyUz(use)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.warning,
          side: const BorderSide(color: AppColors.warning),
          padding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }

  String get _creditLabel {
    final bonus = widget.order.bonusAmount + _bonusAdded;
    if (bonus <= 0) return "Oldindan to'langan";
    return widget.order.prepaidAmount > 0 ? "Oldindan to'lov va bonus" : 'Bonusdan';
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
    final split = _split;
    if (split == null) {
      setState(() => _error = "Naqd qismini to'g'ri kiriting");
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final name = ref.read(currentEmployeeProvider).valueOrNull?['fullName'] as String?;
      final applied = _prepaidApplied;
      await ref.read(ordersRepositoryProvider).deliverOrderItems(
            orderId: widget.order.id,
            itemIds: _selected.toList(),
            paidAmount: paid,
            cashAmount: split.cash,
            cardAmount: split.card,
            kind: _kind == null ? null : _kindKeys[_kind!],
            actorName: name,
            prepaidUsedAfter: applied > 0 ? widget.order.prepaidUsed + applied : null,
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
                'Buyurtma ${widget.order.displayNumber}',
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

              if (_prepaidApplied > 0) ...[
                _SummaryRow(label: 'Mahsulotlar', value: formatMoneyUz(_gross)),
                const SizedBox(height: 4),
                _SummaryRow(
                  label: _creditLabel,
                  value: formatMoneyUz(-_prepaidApplied),
                  tone: AppColors.success,
                ),
                const SizedBox(height: 4),
              ],
              _SummaryRow(label: 'To\'lanishi kerak', value: formatMoneyUz(due), bold: true),
              _bonusButton(),
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

              // To'lov usuli summa kiritilgandan keyin so'raladi —
              // taqsimot aynan shu summadan kelib chiqadi.
              if (amountEntered) ...[
                const SizedBox(height: 4),
                PaymentMethodField(
                  total: paid,
                  onChanged: (split) => setState(() => _split = split),
                ),
                const SizedBox(height: 12),
              ],

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
          flex: 5,
          child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: 8),
        // Katta summa + katta shriftda ham qator sig'adi — raqam kichrayadi.
        Expanded(
          flex: 4,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              value,
              style: TextStyle(
                fontSize: bold ? 16 : 13.5,
                fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
                color: tone ?? AppColors.ink,
              ),
            ),
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

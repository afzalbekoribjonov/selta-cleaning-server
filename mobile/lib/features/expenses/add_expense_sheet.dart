import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/expenses_repository.dart';
import '../../core/utils/money_utils.dart';

/// Tez-tez uchraydigan chiqim turlari — bitta bosish bilan tanlanadi.
/// "Boshqa" tanlansa nomini xodim o'zi yozadi.
const kExpenseKinds = <(String, IconData)>[
  ("Yoqilg'i", Icons.local_gas_station_rounded),
  ('Texnik xizmat', Icons.build_rounded),
  ('Ehtiyot qism', Icons.settings_rounded),
  ('Yuvish vositalari', Icons.cleaning_services_rounded),
];

const _otherKind = 'Boshqa';

/// Chiqim nomiga mos ikonka (ro'yxatda) — tanilmasa umumiy chek belgisi.
IconData expenseIcon(String name) {
  for (final (label, icon) in kExpenseKinds) {
    if (label == name) return icon;
  }
  return Icons.receipt_long_rounded;
}

/// "Chiqim qo'shish" — saqlansa `true` qaytadi.
Future<bool?> openAddExpenseSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _AddExpenseSheet(),
  );
}

class _AddExpenseSheet extends ConsumerStatefulWidget {
  const _AddExpenseSheet();

  @override
  ConsumerState<_AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends ConsumerState<_AddExpenseSheet> {
  final _nameController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  String? _kind;
  bool _fromCash = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  int? get _amount {
    final value = int.tryParse(_amountController.text);
    return value == null || value <= 0 ? null : value;
  }

  String get _name => _kind == _otherKind ? _nameController.text.trim() : (_kind ?? '');

  void _save() {
    final amount = _amount;
    final problem = _kind == null
        ? 'Chiqim turini tanlang'
        : _name.isEmpty
            ? 'Chiqim nomini yozing'
            : amount == null
                ? 'Summani kiriting'
                : null;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    ref.read(expensesRepositoryProvider).add(
          name: _name,
          amount: amount!,
          fromCash: _fromCash,
          note: _noteController.text.trim(),
        );
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
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
                Text("Chiqim qo'shish", style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                const _Label('Turi'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final (label, icon) in kExpenseKinds) _kindChip(label, icon),
                    _kindChip(_otherKind, Icons.more_horiz_rounded),
                  ],
                ),
                if (_kind == _otherKind) ...[
                  const SizedBox(height: 14),
                  const _Label('Chiqim nomi'),
                  TextField(
                    controller: _nameController,
                    autofocus: true,
                    maxLength: 80,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(hintText: "Masalan: Avtoturargoh", counterText: ''),
                    onChanged: (_) => setState(() => _error = null),
                  ),
                ],
                const SizedBox(height: 14),
                const _Label('Summa'),
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
                  decoration: InputDecoration(
                    hintText: '50000',
                    suffixText: "so'm",
                    helperText: amount == null ? null : formatMoneyUz(amount),
                  ),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                  onChanged: (_) => setState(() => _error = null),
                ),
                const SizedBox(height: 14),
                const _Label('Izoh (ixtiyoriy)'),
                TextField(
                  controller: _noteController,
                  maxLines: 2,
                  maxLength: 300,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Masalan: Damas, 20 litr', counterText: ''),
                ),
                const SizedBox(height: 12),
                _FromCashSwitch(value: _fromCash, onChanged: (v) => setState(() => _fromCash = v)),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('SAQLASH', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _kindChip(String label, IconData icon) {
    final selected = _kind == label;
    return ChoiceChip(
      avatar: Icon(icon, size: 16, color: selected ? Colors.white : AppColors.grayDark),
      label: Text(label),
      selected: selected,
      showCheckmark: false,
      onSelected: (_) => setState(() {
        _kind = label;
        _error = null;
      }),
      labelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: selected ? Colors.white : AppColors.ink),
      selectedColor: AppColors.primary,
      backgroundColor: AppColors.surface,
      side: BorderSide(color: selected ? AppColors.primary : AppColors.border),
    );
  }
}

/// "Qo'limdagi naqddan" — belgilansa summa bugun topshiriladigan naqddan
/// ayiriladi (admin kunlik kassada ham shunday ko'radi).
class _FromCashSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;

  const _FromCashSwitch({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: value ? AppColors.warning.withValues(alpha: 0.1) : AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => onChanged(!value),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: value ? AppColors.warning : AppColors.border),
          ),
          child: Row(
            children: [
              const Icon(Icons.payments_rounded, size: 20, color: AppColors.warning),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Qo'limdagi naqddan", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                    SizedBox(height: 2),
                    Text(
                      'Bugun topshiradigan naqdingizdan ayiriladi',
                      style: TextStyle(fontSize: 11.5, color: AppColors.grayDark, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
              Switch(value: value, onChanged: onChanged),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      );
}

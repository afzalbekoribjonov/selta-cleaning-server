import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme.dart';
import '../../core/utils/money_utils.dart';

/// Pul qanday olingani.
///
/// `mixed` — summaning bir qismi naqd, qolgani karta orqali. Uchinchi
/// variant ataylab: amalda mijoz ko'pincha kartadagi yetmagan summani
/// naqd bilan to'ldiradi va buni BITTA yozuvda qayd etish kerak.
enum PaymentMethod { cash, card, mixed }

/// Olingan summaning naqd va karta ulushlari. Yig'indisi HAR DOIM
/// olingan summaga teng — server ham aynan shuni tekshiradi.
class PaymentSplit {
  final num cash;
  final num card;

  const PaymentSplit({required this.cash, required this.card});
}

/// To'lov usulini tanlash maydoni.
///
/// `onChanged` ga `null` kelishi — aralash usul tanlangan, lekin naqd
/// qismi hali to'g'ri kiritilmagan degani. Chaqiruvchi shunda yuborish
/// tugmasini bloklaydi: yig'indi mos kelmasa server baribir rad etadi,
/// lekin xatoni oldindan ko'rsatgan ma'qul.
class PaymentMethodField extends StatefulWidget {
  /// Mijozdan olingan umumiy summa.
  final num total;
  final ValueChanged<PaymentSplit?> onChanged;

  const PaymentMethodField({super.key, required this.total, required this.onChanged});

  @override
  State<PaymentMethodField> createState() => _PaymentMethodFieldState();
}

class _PaymentMethodFieldState extends State<PaymentMethodField> {
  PaymentMethod _method = PaymentMethod.cash;
  final _cashController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Birinchi qiymat ramka qurilgandan KEYIN yuboriladi — `build`
    // davomida ota-vidjetning holatini o'zgartirish mumkin emas.
    WidgetsBinding.instance.addPostFrameCallback((_) => _emit());
  }

  @override
  void didUpdateWidget(covariant PaymentMethodField old) {
    super.didUpdateWidget(old);
    // Umumiy summa o'zgarsa taqsimot ham o'zgaradi: naqd/kartada butun
    // summa, aralashda esa karta qismi qayta hisoblanadi.
    //
    // Xabar ramkadan KEYIN yuboriladi: `didUpdateWidget` ota-vidjetning
    // build'i davomida chaqiriladi, u yerda esa ota-vidjetda `setState`
    // qilish mumkin emas ("called during build" xatosi).
    if (old.total != widget.total) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _emit());
    }
  }

  @override
  void dispose() {
    _cashController.dispose();
    super.dispose();
  }

  num? get _cashPart {
    final raw = _cashController.text.replaceAll(' ', '');
    if (raw.isEmpty) return null;
    return num.tryParse(raw);
  }

  PaymentSplit? get _split {
    final total = widget.total;
    if (total < 0) return null;
    switch (_method) {
      case PaymentMethod.cash:
        return PaymentSplit(cash: total, card: 0);
      case PaymentMethod.card:
        return PaymentSplit(cash: 0, card: total);
      case PaymentMethod.mixed:
        final cash = _cashPart;
        if (cash == null || cash < 0 || cash > total) return null;
        return PaymentSplit(cash: cash, card: total - cash);
    }
  }

  void _emit() {
    if (!mounted) return;
    widget.onChanged(_split);
  }

  void _select(PaymentMethod method) {
    setState(() => _method = method);
    _emit();
  }

  @override
  Widget build(BuildContext context) {
    final split = _split;
    final cashPart = _cashPart;
    final overpaid = _method == PaymentMethod.mixed && cashPart != null && cashPart > widget.total;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          "Qanday to'landi?",
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _MethodChip(
              icon: Icons.payments_rounded,
              label: 'Naqd',
              selected: _method == PaymentMethod.cash,
              onTap: () => _select(PaymentMethod.cash),
            ),
            const SizedBox(width: 8),
            _MethodChip(
              icon: Icons.credit_card_rounded,
              label: 'Karta',
              selected: _method == PaymentMethod.card,
              onTap: () => _select(PaymentMethod.card),
            ),
            const SizedBox(width: 8),
            _MethodChip(
              icon: Icons.call_split_rounded,
              label: 'Aralash',
              selected: _method == PaymentMethod.mixed,
              onTap: () => _select(PaymentMethod.mixed),
            ),
          ],
        ),
        if (_method == PaymentMethod.mixed) ...[
          const SizedBox(height: 12),
          const Text(
            'Naqd qismi',
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.grayDark),
          ),
          const SizedBox(height: 6),
          TextField(
            controller: _cashController,
            keyboardType: const TextInputType.numberWithOptions(decimal: false),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onChanged: (_) => setState(_emit),
            decoration: InputDecoration(
              hintText: '0',
              suffixText: "so'm",
              filled: true,
              fillColor: AppColors.surface,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.border),
              ),
            ),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          const SizedBox(height: 8),
          // Karta qismi QO'LDA kiritilmaydi — u qoldiqdan kelib chiqadi,
          // shuning uchun yig'indi hech qachon noto'g'ri bo'lolmaydi.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: overpaid ? AppColors.danger.withValues(alpha: 0.08) : AppColors.bg,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(
                  overpaid ? Icons.error_outline_rounded : Icons.credit_card_rounded,
                  size: 16,
                  color: overpaid ? AppColors.danger : AppColors.grayDark,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    overpaid
                        ? 'Naqd qismi olingan summadan katta'
                        : cashPart == null
                            ? 'Naqd qismini kiriting'
                            : 'Karta orqali: ${formatMoneyUz(split!.card)}',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: overpaid ? AppColors.danger : AppColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _MethodChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _MethodChip({required this.icon, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary.withValues(alpha: 0.12) : AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Column(
            children: [
              Icon(icon, size: 18, color: selected ? AppColors.primary : AppColors.gray),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: selected ? AppColors.primary : AppColors.grayDark,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Qarz yoki qisman to'lovni yopish oynasi.
///
/// Yopilayotgan summani ko'rsatadi va uning naqd/karta ulushini
/// so'raydi. Bekor qilinsa `null` qaytadi.
Future<PaymentSplit?> openSettleSheet(
  BuildContext context, {
  required int orderNumber,
  required num amount,
}) {
  return showModalBottomSheet<PaymentSplit>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _SettleSheet(orderNumber: orderNumber, amount: amount),
  );
}

class _SettleSheet extends StatefulWidget {
  final int orderNumber;
  final num amount;

  const _SettleSheet({required this.orderNumber, required this.amount});

  @override
  State<_SettleSheet> createState() => _SettleSheetState();
}

class _SettleSheetState extends State<_SettleSheet> {
  PaymentSplit? _split;

  @override
  Widget build(BuildContext context) {
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
              const Text(
                'Qolgan pulni yopish',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.ink),
              ),
              Text(
                'Buyurtma #${widget.orderNumber}',
                style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Olinayotgan summa',
                        style: TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(
                      formatMoneyUz(widget.amount),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.ink),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              PaymentMethodField(
                total: widget.amount,
                onChanged: (split) => setState(() => _split = split),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _split == null ? null : () => Navigator.pop(context, _split),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('Tasdiqlash', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Bekor qilish', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

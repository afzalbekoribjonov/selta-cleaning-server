import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/bonus_service.dart';
import '../../core/services/customer_search.dart';
import '../../core/services/employee_repository.dart';
import '../../core/utils/launch_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import '../delivery/delivery_order_detail_sheet.dart';
import '../dispatcher/order_detail_sheet.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/bonus_section.dart' show bonusPhoneKey;
import '../shared/team_job_detail_sheet.dart';
import '../worker/worker_order_detail_sheet.dart';

/// [initialPhone] berilsa (9 raqam) ekran shu mijoz bilan darhol ochiladi —
/// masalan yangi buyurtma formasidagi "Ko'rish" tugmasidan.
void openGlobalSearch(BuildContext context, {String? initialPhone}) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => GlobalSearchScreen(initialPhone: initialPhone)));
}

enum _Mode { phone, number }

/// Butun bazadan qidirish — barcha bo'limlar uchun umumiy.
///
/// Telefon yoki buyurtma ID'si bo'yicha; natija — mijozning to'liq
/// manzarasi: necha marta buyurtma bergani, faol va yakunlanganlari,
/// jami summa. Qarz va chegirmalar FAQAT moliyaga ruxsati borlarga
/// (admin panelda beriladi) ko'rinadi — server ham buni tekshiradi.
///
/// Bo'limlardagi qidiruv maydonlari esa faqat o'z bo'limidan izlaydi.
class GlobalSearchScreen extends ConsumerStatefulWidget {
  final String? initialPhone;

  const GlobalSearchScreen({super.key, this.initialPhone});

  @override
  ConsumerState<GlobalSearchScreen> createState() => _GlobalSearchScreenState();
}

class _GlobalSearchScreenState extends ConsumerState<GlobalSearchScreen> {
  _Mode _mode = _Mode.phone;
  final _controller = TextEditingController();
  final _focus = FocusNode();

  bool _searching = false;
  bool _searched = false;
  String? _error;
  CustomerResult? _result;

  AsyncValue<CustomerFinance>? _finance;

  @override
  void initState() {
    super.initState();
    final digits = widget.initialPhone?.replaceAll(RegExp(r'\D'), '') ?? '';
    if (digits.length >= 9) {
      _controller.text = UzPhoneFormatter()
          .formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: digits.substring(digits.length - 9)))
          .text;
      WidgetsBinding.instance.addPostFrameCallback((_) => _search());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  String get _digits => _controller.text.replaceAll(RegExp(r'\D'), '');

  bool get _canSearch => _mode == _Mode.phone ? _digits.length == 9 : _digits.isNotEmpty;

  void _switchMode(_Mode mode) {
    if (mode == _mode) return;
    setState(() {
      _mode = mode;
      _controller.clear();
      _result = null;
      _finance = null;
      _searched = false;
      _error = null;
    });
    _focus.requestFocus();
  }

  Future<void> _search() async {
    if (!_canSearch || _searching) return;
    _focus.unfocus();
    setState(() {
      _searching = true;
      _error = null;
      _finance = null;
    });
    try {
      final search = ref.read(customerSearchProvider);
      final result = _mode == _Mode.phone ? await search.byPhone(_digits) : await search.byNumber(int.parse(_digits));
      if (!mounted) return;
      setState(() {
        _result = result;
        _searched = true;
        _searching = false;
      });
      if (result != null) _loadFinance(result.phone);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searched = true;
        _result = null;
        _error = describeApiError(e);
      });
    }
  }

  Future<void> _loadFinance(String phone) async {
    final employee = ref.read(currentEmployeeProvider).valueOrNull;
    final claims = ref.read(employeeClaimsProvider).valueOrNull;
    final allowed = employee?['canViewFinance'] == true || claims?.role == 'admin';
    if (!allowed) return;

    setState(() => _finance = const AsyncLoading());
    try {
      final finance = await ref.read(customerSearchProvider).finance(phone);
      if (mounted) setState(() => _finance = AsyncData(finance));
    } catch (e, st) {
      if (mounted) setState(() => _finance = AsyncError(e, st));
    }
  }

  void _openOrder(Order order, {bool focusComments = false}) {
    final department = ref.read(currentEmployeeProvider).valueOrNull?['department'] as String?;
    if (order.serviceType == 'onsite' && department != 'dispatcher') {
      openTeamJobDetailSheet(context, order, focusComments: focusComments);
    } else if (department == 'delivery') {
      openDeliveryOrderDetailSheet(context, order, focusComments: focusComments);
    } else if (department == 'worker') {
      openWorkerOrderDetailSheet(context, order, focusComments: focusComments);
    } else {
      openOrderDetailSheet(context, order, focusComments: focusComments);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Qidiruv')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: SegmentedButton<_Mode>(
              segments: const [
                ButtonSegment(value: _Mode.phone, label: Text('Telefon'), icon: Icon(Icons.phone_rounded, size: 18)),
                ButtonSegment(value: _Mode.number, label: Text('Buyurtma ID'), icon: Icon(Icons.tag_rounded, size: 18)),
              ],
              selected: {_mode},
              showSelectedIcon: false,
              onSelectionChanged: (s) => _switchMode(s.first),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focus,
                    autofocus: widget.initialPhone == null,
                    keyboardType: _mode == _Mode.phone ? TextInputType.phone : TextInputType.number,
                    textInputAction: TextInputAction.search,
                    inputFormatters: _mode == _Mode.phone
                        ? [UzPhoneFormatter()]
                        : [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _search(),
                    decoration: InputDecoration(
                      hintText: _mode == _Mode.phone ? '90 123 45 67' : 'Masalan 1245',
                      prefixText: _mode == _Mode.phone ? '+998 ' : '# ',
                      filled: true,
                      fillColor: AppColors.surface,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
                      enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
                    ),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(
                  height: 50,
                  width: 50,
                  child: FilledButton(
                    onPressed: _canSearch && !_searching ? _search : null,
                    style: FilledButton.styleFrom(
                        padding: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    child: _searching
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                        : const Icon(Icons.search_rounded),
                  ),
                ),
              ],
            ),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_error != null) return _Hint(icon: Icons.cloud_off_rounded, text: _error!);
    if (!_searched) {
      return _Hint(
        icon: Icons.manage_search_rounded,
        text: _mode == _Mode.phone
            ? "Mijozning to'liq raqamini kiriting — barcha buyurtmalari va holati chiqadi"
            : 'Buyurtma raqamini kiriting',
      );
    }
    final result = _result;
    if (result == null) return const _Hint(icon: Icons.search_off_rounded, text: 'Hech narsa topilmadi');

    final active = result.active;
    final completed = result.completed;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        _CustomerCard(result: result),
        _BonusBalance(phone: result.phone),
        if (_finance != null) ...[
          const SizedBox(height: 12),
          _FinanceCard(finance: _finance!),
        ],
        if (result.focus != null) ...[
          const _SectionTitle('Qidirilgan buyurtma'),
          OrderCard(
            order: result.focus!,
            onTap: () => _openOrder(result.focus!),
            onCommentTap: () => _openOrder(result.focus!, focusComments: true),
          ),
        ],
        if (active.isNotEmpty) ...[
          _SectionTitle('Faol buyurtmalar · ${active.length}'),
          for (final o in active) ...[
            OrderCard(order: o, onTap: () => _openOrder(o), onCommentTap: () => _openOrder(o, focusComments: true)),
            const SizedBox(height: 10),
          ],
        ],
        if (completed.isNotEmpty) ...[
          _SectionTitle('Yakunlangan · ${completed.length}'),
          for (final o in completed) ...[
            OrderCard(order: o, onTap: () => _openOrder(o), onCommentTap: () => _openOrder(o, focusComments: true)),
            const SizedBox(height: 10),
          ],
        ],
      ],
    );
  }
}

class _CustomerCard extends StatelessWidget {
  final CustomerResult result;
  const _CustomerCard({required this.result});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(gradient: primaryGradient, borderRadius: BorderRadius.circular(20)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.customerName.isEmpty ? "Noma'lum mijoz" : result.customerName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      formatPhoneUz(result.phone),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => callPhone(result.phone),
                tooltip: "Qo'ng'iroq",
                style: IconButton.styleFrom(backgroundColor: Colors.white.withValues(alpha: 0.18)),
                icon: const Icon(Icons.call_rounded, color: Colors.white),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _Stat(value: '${result.orders.length}', label: 'Jami'),
              _Stat(value: '${result.active.length}', label: 'Faol'),
              _Stat(value: '${result.completed.length}', label: 'Yakunlangan'),
              _Stat(value: formatMoneyShortUz(result.totalSpent), label: 'Jami summa', flex: 4),
            ],
          ),
        ],
      ),
    );
  }
}

/// Mijozning bonus (keshbek) hisobi — "bonusingiz bor" deb taklif qilish
/// uchun. Internet bo'lmasa yoki bonus yo'q bo'lsa ko'rinmaydi.
class _BonusBalance extends ConsumerWidget {
  final String phone;
  const _BonusBalance({required this.phone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = bonusPhoneKey(phone);
    final bonus = key == null ? null : ref.watch(customerBonusProvider(key)).valueOrNull;
    if (bonus == null || (bonus.balance <= 0 && bonus.earnedTotal <= 0)) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Icon(Icons.card_giftcard_rounded, size: 20, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Bonus hisobi', style: TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w700)),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    formatMoneyUz(bonus.balance),
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.ink),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              'Jami olgan: ${formatMoneyShortUz(bonus.earnedTotal)}\nIshlatgan: ${formatMoneyShortUz(bonus.spentTotal)}',
              textAlign: TextAlign.right,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;
  final int flex;
  const _Stat({required this.value, required this.label, this.flex = 3});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      flex: flex,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _FinanceCard extends StatelessWidget {
  final AsyncValue<CustomerFinance> finance;
  const _FinanceCard({required this.finance});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: finance.when(
        loading: () => const SizedBox(height: 40, child: Center(child: CircularProgressIndicator(strokeWidth: 2.4))),
        error: (_, __) => const Row(
          children: [
            Icon(Icons.cloud_off_rounded, size: 18, color: AppColors.gray),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                "Qarz va chegirmalarni ko'rish uchun internet kerak",
                style: TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
        data: (f) => f.isClean
            ? const Row(
                children: [
                  Icon(Icons.verified_rounded, size: 18, color: AppColors.success),
                  SizedBox(width: 8),
                  Text("Qarz va chegirma yo'q", style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink)),
                ],
              )
            : Column(
                children: [
                  if (f.debtCount > 0)
                    _MoneyRow(
                        icon: Icons.money_off_rounded, label: 'Qarz', count: f.debtCount, amount: f.debtAmount, color: AppColors.danger),
                  if (f.partialCount > 0)
                    _MoneyRow(
                      icon: Icons.hourglass_bottom_rounded,
                      label: "Qisman to'lov qoldig'i",
                      count: f.partialCount,
                      amount: f.partialAmount,
                      color: AppColors.warning,
                    ),
                  if (f.discountCount > 0)
                    _MoneyRow(
                        icon: Icons.percent_rounded,
                        label: 'Chegirma',
                        count: f.discountCount,
                        amount: f.discountAmount,
                        color: AppColors.info),
                ],
              ),
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final int count;
  final num amount;
  final Color color;

  const _MoneyRow({required this.icon, required this.label, required this.count, required this.amount, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$label · $count ta',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink),
            ),
          ),
          Text(formatMoneyUz(amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: color)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 18, 2, 8),
        child: Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.grayDark)),
      );
}

class _Hint extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Hint({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: AppColors.gray),
            const SizedBox(height: 12),
            Text(text,
                textAlign: TextAlign.center, style: const TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600, height: 1.4)),
          ],
        ),
      ),
    );
  }
}

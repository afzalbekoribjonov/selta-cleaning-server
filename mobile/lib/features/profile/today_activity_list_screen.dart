import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/my_activity_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../shared/payment_method_field.dart';

enum TodayListKind { broughtIn, delivered, washed, packed, created, payments }

const _titles = {
  TodayListKind.broughtIn: 'Sexga olib kelganlar',
  TodayListKind.delivered: 'Yetkazilganlar',
  TodayListKind.washed: 'Yuvilganlar',
  TodayListKind.packed: 'Upakovka qilinganlar',
  TodayListKind.created: 'Ochilgan buyurtmalar',
  TodayListKind.payments: "Bugungi to'lovlar",
};

void openTodayActivityList(
  BuildContext context, {
  required TodayListKind kind,
  required MyDailyActivity activity,
}) {
  Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => TodayActivityListScreen(kind: kind, activity: activity)),
  );
}

/// Profil sahifasidagi "Ko'rish" ochadigan ro'yxat.
///
/// Ma'lumot allaqachon profil bilan birga kelgan — bu ekran qo'shimcha
/// so'rov yubormaydi. Tartib: eng SO'NGGI yozuv birinchi (talab).
class TodayActivityListScreen extends StatelessWidget {
  final TodayListKind kind;
  final MyDailyActivity activity;

  const TodayActivityListScreen({super.key, required this.kind, required this.activity});

  @override
  Widget build(BuildContext context) {
    final children = switch (kind) {
      TodayListKind.broughtIn => activity.broughtIn.map((o) => _OrderTile(entry: o)).toList(),
      TodayListKind.created => activity.created.map((o) => _OrderTile(entry: o)).toList(),
      TodayListKind.delivered => activity.delivered.map((s) => _StageTile(entry: s, showPrice: true)).toList(),
      TodayListKind.washed => activity.washed.map((s) => _StageTile(entry: s, showPrice: false)).toList(),
      TodayListKind.packed => activity.packed.map((s) => _StageTile(entry: s, showPrice: false)).toList(),
      TodayListKind.payments => activity.payments.map((p) => _PaymentTile(entry: p)).toList(),
    };

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(title: Text(_titles[kind]!)),
      body: children.isEmpty
          ? const Center(
              child: Text(
                "Yo'q",
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.gray),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              itemCount: children.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) => children[i],
            ),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  final Color? borderColor;
  const _Card({required this.child, this.borderColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor ?? AppColors.border),
      ),
      child: child,
    );
  }
}

class _OrderTile extends StatelessWidget {
  final OrderEntry entry;
  const _OrderTile({required this.entry});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('#${entry.orderNumber}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.ink)),
              const Spacer(),
              Text(formatMoneyUz(entry.totalPrice),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.primary)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            entry.customerName.isEmpty ? "Noma'lum" : entry.customerName,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
          Text(entry.phone, style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark)),
          const SizedBox(height: 8),
          _MetaRow(
            items: [
              if (entry.at != null) formatTimeHm(entry.at!),
              '${entry.itemCount} ta mahsulot',
              if (entry.location.isNotEmpty) entry.location,
            ],
          ),
        ],
      ),
    );
  }
}

class _StageTile extends StatelessWidget {
  final StageEntry entry;
  final bool showPrice;
  const _StageTile({required this.entry, required this.showPrice});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('#${entry.orderNumber}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.ink)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  entry.itemNumber != null ? '${entry.itemNumber}. ${entry.itemName}' : entry.itemName,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${_trim(entry.unitAmount)} ${entry.unitLabel}',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.ink),
                  ),
                  if (showPrice)
                    Text(formatMoneyUz(entry.price),
                        style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 6),
          _MetaRow(
            items: [
              if (entry.at != null) formatTimeHm(entry.at!),
              if (entry.customerName.isNotEmpty) entry.customerName,
            ],
          ),
        ],
      ),
    );
  }
}

const _kindLabels = {
  'full': "To'liq to'landi",
  'partial': "Qisman to'landi",
  'debt': 'Qarz',
  'discount': 'Chegirma',
};

const _kindColors = {
  'full': AppColors.success,
  'partial': AppColors.warning,
  'debt': AppColors.danger,
  'discount': AppColors.info,
};

/// Qarz/qisman to'lov yozuvi. Mijoz qolgan pulni bergan bo'lsa,
/// dastavchik uni shu yerdan yopa oladi (admin ham panelda yopa oladi).
class _PaymentTile extends ConsumerStatefulWidget {
  final PaymentEntry entry;
  const _PaymentTile({required this.entry});

  @override
  ConsumerState<_PaymentTile> createState() => _PaymentTileState();
}

class _PaymentTileState extends ConsumerState<_PaymentTile> {
  bool _busy = false;
  bool _done = false;
  String? _error;

  Future<void> _settle() async {
    // Oddiy tasdiqlash dialogi emas, balki oyna: yopilgan pul naqd ham,
    // karta orqali ham kelishi mumkin va u o'sha kunning kassa hisobiga
    // tushadi — usul so'ralmasa, karta puli naqd deb sanalardi.
    final split = await openSettleSheet(
      context,
      orderNumber: widget.entry.orderNumber,
      amount: widget.entry.shortfall,
    );
    if (split == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).settlePayment(
            paymentId: widget.entry.id,
            cashAmount: split.cash,
            cardAmount: split.card,
          );
      if (mounted) setState(() => _done = true);
      ref.invalidate(myDailyActivityProvider);
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
    final entry = widget.entry;
    final tone = _kindColors[entry.kind] ?? AppColors.grayDark;
    final open = entry.shortfall > 0 && !entry.settled && !_done;

    return _Card(
      borderColor: open ? tone.withValues(alpha: 0.4) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('#${entry.orderNumber}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.ink)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: tone.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                child: Text(
                  _kindLabels[entry.kind] ?? entry.kind,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: tone),
                ),
              ),
              const Spacer(),
              if ((entry.settled || _done) && entry.shortfall > 0)
                const Icon(Icons.check_circle_rounded, size: 16, color: AppColors.success),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            entry.customerName.isEmpty ? "Noma'lum" : entry.customerName,
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
          const SizedBox(height: 8),
          _AmountRow(label: 'Summa', value: formatMoneyUz(entry.dueAmount), tone: AppColors.grayDark),
          _AmountRow(label: 'Olindi', value: formatMoneyUz(entry.paidAmount), tone: AppColors.ink),
          if (entry.shortfall > 0)
            _AmountRow(
              label: entry.kind == 'discount' ? 'Chegirma' : 'Qoldi',
              value: formatMoneyUz(entry.shortfall),
              tone: tone,
            ),
          const SizedBox(height: 6),
          _MetaRow(items: [if (entry.at != null) formatTimeHm(entry.at!), entry.phone]),
          if (open) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy ? null : _settle,
                icon: const Icon(Icons.check_rounded, size: 16),
                label: Text(_busy ? '...' : 'Qolgan pul olindi', style: const TextStyle(fontWeight: FontWeight.w800)),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.success,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
          if (_done)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Yopildi',
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.success),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _error!,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.danger),
              ),
            ),
        ],
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  final String label;
  final String value;
  final Color tone;
  const _AmountRow({required this.label, required this.value, required this.tone});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.gray))),
          Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: tone)),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final List<String> items;
  const _MetaRow({required this.items});

  @override
  Widget build(BuildContext context) {
    final visible = items.where((s) => s.trim().isNotEmpty).toList();
    if (visible.isEmpty) return const SizedBox.shrink();
    return Text(
      visible.join(' · '),
      style: const TextStyle(fontSize: 11.5, color: AppColors.gray, fontWeight: FontWeight.w600),
    );
  }
}

String _trim(num value) {
  if (value == value.roundToDouble()) return value.round().toString();
  return value.toStringAsFixed(2).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
}

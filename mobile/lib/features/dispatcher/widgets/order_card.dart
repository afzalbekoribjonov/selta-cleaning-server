import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../../core/constants.dart';
import '../../../core/models/order.dart';
import '../../../core/services/order_items_provider.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/utils/money_utils.dart';

/// Ro'yxatdagi buyurtma kartasi — barcha bo'limlarda bir xil "ixcham"
/// ramka; o'rtadagi qatorlar ([facts]) bo'limga qarab o'zgaradi.
///
/// Tuzilish:
///   #1245 · Aziz Karimov ................ [Tayyor]
///   90 123 45 67 · Yunusobod 4-kv.
///   (bo'limga xos qatorlar)                 ~4 km
///   12-okt · 2 kun qoldi
///
/// Tugmalar ATAYLAB yo'q: karta bosilganda ichki kartada barcha amallar
/// bor. Holat chap tomondagi rangli chiziq bilan, muddati o'tgani qizil
/// chegara bilan ajraladi.
///
/// Avvalgi karta `IntrinsicHeight` ishlatardi — u har bir kartani ikki
/// marta o'lchaydi va uzun ro'yxatda aylantirish sezilarli sekinlashardi.
/// Sarlavha qatori esa `Spacer` bilan qurilgan edi: uzun ism yoki holat
/// matni ekrandan chiqib ketardi. Endi har bir matn o'z joyida qisqaradi.
class OrderCard extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;

  /// Bo'limga xos qatorlar. Berilmasa — buyurtma summasi.
  final List<CardFact>? facts;

  /// Birinchi qatorning o'ng tomonida (masalan masofa "~4 km").
  final String? trailing;

  const OrderCard({super.key, required this.order, required this.onTap, this.facts, this.trailing});

  @override
  Widget build(BuildContext context) {
    final stage = orderStage(order);
    final dueDate = effectiveDueDate(order);
    final overdue = dueDate != null && !order.isDone && DateTime.now().isAfter(dueDate);
    // Jamoa biriktirilmagan joyida-yuvish buyurtmasi e'tiborni tortib
    // turishi kerak (talab).
    final needsTeam = order.serviceType == 'onsite' && order.status == 'new' && order.assignedTeam.isEmpty;
    final lines = facts ?? [CardFact(Icons.payments_rounded, formatMoneyUz(order.totalPrice))];

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: needsTeam || overdue ? AppColors.danger.withValues(alpha: needsTeam ? 0.9 : 0.4) : AppColors.border,
              width: needsTeam ? 1.4 : 1,
            ),
          ),
          child: Stack(
            children: [
              // Holat chizig'i — kartaning balandligini o'zi belgilamaydi,
              // shuning uchun o'lchash ikki marta kerak emas.
              Positioned(left: 0, top: 0, bottom: 0, width: 4, child: ColoredBox(color: stage.color)),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Header(order: order, stage: stage),
                    const SizedBox(height: 3),
                    _Contact(order: order),
                    if (needsTeam) ...[
                      const SizedBox(height: 7),
                      const _TeamAlertBanner(),
                    ],
                    if (lines.isNotEmpty) const SizedBox(height: 7),
                    for (var i = 0; i < lines.length; i++)
                      Padding(
                        padding: EdgeInsets.only(top: i == 0 ? 0 : 3),
                        child: _FactRow(fact: lines[i], trailing: i == 0 ? trailing : null),
                      ),
                    if (dueDate != null && !order.isDone) ...[
                      const SizedBox(height: 4),
                      _DueRow(due: dueDate, overdue: overdue, tariff: order.tariff),
                    ],
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

/// Kartadagi bitta qator: belgi + matn.
class CardFact {
  final IconData icon;
  final String text;
  final Color? color;

  /// Asosiy raqam (masalan yig'ilishi kerak summa) — kattaroq va qalin.
  final bool strong;

  const CardFact(this.icon, this.text, {this.color, this.strong = false});

  /// "4 mahsulot · 2 yuvilmoqda · 1 upakovkada" — buyurtma xulosasidan,
  /// mahsulotlarni o'qimasdan.
  static CardFact stages(Order order) {
    final c = order.itemStatusCounts;
    final total = c.values.fold<int>(0, (s, v) => s + v);
    final parts = <String>[
      '$total mahsulot',
      if ((c['pending'] ?? 0) > 0) '${c['pending']} navbatda',
      if ((c['washing'] ?? 0) > 0) '${c['washing']} yuvilmoqda',
      if ((c['returned'] ?? 0) > 0) '${c['returned']} qaytarilgan',
      if ((c['packing'] ?? 0) > 0) '${c['packing']} upakovkada',
      if ((c['ready'] ?? 0) > 0) '${c['ready']} tayyor',
    ];
    return CardFact(Icons.layers_rounded, parts.join(' · '));
  }
}

/// Ro'yxat kartasidagi holat — buyurtma holatidan ko'ra aniqroq.
///
/// Olib kelish buyurtmasi sexga kelgach butun ishlov davomida "Sexga
/// keldi" holatida turadi — kartada bu hech narsa demaydi. Shuning uchun
/// mahsulotlar sanog'idan haqiqiy bosqich chiqariladi: "Tayyor",
/// "2/4 tayyor", "Upakovka"...
({String label, Color color, Color background}) orderStage(Order order) {
  if (order.serviceType == 'pickup' && order.status == 'brought_in') {
    final c = order.itemStatusCounts;
    final remaining = c.entries.where((e) => e.key != 'done').fold<int>(0, (s, e) => s + e.value);
    final ready = c['ready'] ?? 0;
    String key;
    String? label;
    if (remaining == 0 && (c['done'] ?? 0) > 0) {
      key = 'done';
    } else if (ready > 0 && ready == remaining) {
      key = 'ready';
    } else if (ready > 0) {
      key = 'ready';
      label = '$ready/$remaining tayyor';
    } else if ((c['packing'] ?? 0) > 0) {
      key = 'packing';
    } else if ((c['washing'] ?? 0) > 0 || (c['returned'] ?? 0) > 0) {
      key = 'washing';
    } else {
      key = 'brought_in';
    }
    final s = statusOf(key);
    return (label: label ?? s.label, color: s.color, background: s.background);
  }
  final s = statusOf(order.status);
  return (label: s.label, color: s.color, background: s.background);
}

class _Header extends StatelessWidget {
  final Order order;
  final ({String label, Color color, Color background}) stage;

  const _Header({required this.order, required this.stage});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          order.displayNumber,
          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14.5, color: AppColors.ink),
        ),
        if (order.pendingSync) ...[
          const SizedBox(width: 4),
          const Tooltip(
            message: 'Serverga hali yuborilmagan',
            child: Icon(Icons.cloud_upload_outlined, size: 14, color: AppColors.gray),
          ),
        ],
        const SizedBox(width: 6),
        const Text('·', style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w900)),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: AppColors.ink),
          ),
        ),
        const SizedBox(width: 8),
        // Holat belgisi cheklangan kenglikda: eng tor ekranda ham ism
        // uchun joy qoladi (sarlavha toshib ketmaydi).
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 112),
          child: _Pill(label: stage.label, color: stage.color, background: stage.background),
        ),
      ],
    );
  }
}

class _Contact extends StatelessWidget {
  final Order order;
  const _Contact({required this.order});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(order.phone.replaceFirst('+998', ''), style: const TextStyle(color: AppColors.grayDark, fontSize: 12.5)),
        if (order.location.isNotEmpty) ...[
          const Text('  ·  ', style: TextStyle(color: AppColors.gray, fontSize: 12.5)),
          Expanded(
            child: Text(
              order.location,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.grayDark, fontSize: 12.5),
            ),
          ),
        ],
      ],
    );
  }
}

class _FactRow extends StatelessWidget {
  final CardFact fact;
  final String? trailing;

  const _FactRow({required this.fact, this.trailing});

  @override
  Widget build(BuildContext context) {
    final color = fact.color ?? (fact.strong ? AppColors.ink : AppColors.grayDark);
    return Row(
      children: [
        Icon(fact.icon, size: fact.strong ? 15 : 13.5, color: fact.color ?? AppColors.gray),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            fact.text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: fact.strong ? 14 : 12.5,
              fontWeight: fact.strong ? FontWeight.w900 : FontWeight.w600,
            ),
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              trailing!,
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.primary),
            ),
          ),
        ],
      ],
    );
  }
}

class _DueRow extends StatelessWidget {
  final DateTime due;
  final bool overdue;

  /// Joyida yuvishda buyurtmaning tarifi — muddatni aynan u belgilaydi,
  /// shuning uchun yonma-yon turadi. (Olib kelishda tarif har bir
  /// mahsulotda alohida — ichki kartada ko'rinadi.)
  final String? tariff;

  const _DueRow({required this.due, required this.overdue, this.tariff});

  @override
  Widget build(BuildContext context) {
    final soon = !overdue && daysUntil(due) <= 1;
    final color = overdue
        ? AppColors.danger
        : soon
            ? AppColors.warning
            : AppColors.grayDark;
    final info = tariff != null ? tariffOf(tariff) : null;
    return Row(
      children: [
        Icon(overdue ? Icons.warning_rounded : Icons.event_rounded, size: 13.5, color: overdue ? AppColors.danger : AppColors.gray),
        const SizedBox(width: 6),
        if (info != null) ...[
          _Pill(label: info.label, color: info.color, background: info.background),
          const SizedBox(width: 6),
        ],
        Flexible(
          child: Text(
            '${formatDateUz(due)} · ${dueLabelUz(due)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color, fontSize: 12.5, fontWeight: overdue || soon ? FontWeight.w800 : FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

/// Jamoa biriktirilmagan joyida-yuvish buyurtmasi uchun ogohlantirish —
/// talab: "qandaydir qizarib danger holatda yonib o'chadigan" bo'lsin.
/// Nafas olayotgandek silliq o'zgaradi (keskin miltillash emas) — uzoq
/// tikilib turadigan ro'yxatda charchatmasligi uchun.
class _TeamAlertBanner extends StatefulWidget {
  const _TeamAlertBanner();

  @override
  State<_TeamAlertBanner> createState() => _TeamAlertBannerState();
}

class _TeamAlertBannerState extends State<_TeamAlertBanner> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.danger.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.groups_rounded, size: 13, color: AppColors.danger),
            SizedBox(width: 5),
            Text(
              'Jamoa biriktirilmagan',
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.danger),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ichki kartadagi harakat tugmasi — "Qo'ng'iroq"/"Yo'lga chiqish" kabi
/// (talab: Selta brend ranglariga mos, professional ko'rinish).
class CardActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool filled;

  const CardActionButton({super.key, required this.icon, required this.label, required this.onTap, this.filled = false});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: filled ? AppColors.primary : AppColors.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 15, color: filled ? Colors.white : AppColors.primary),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: filled ? Colors.white : AppColors.primary),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color color;
  final Color background;

  const _Pill({required this.label, required this.color, required this.background});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w800),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/my_activity_repository.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';
import 'today_activity_list_screen.dart';

/// Profil sahifasidagi "Bugungi ish" bo'limi — xodim aynan BUGUN nima
/// qilganini ko'rsatadi.
///
/// Ma'lumot serverdan bitta so'rov bilan keladi (`/myDailyActivity`) va
/// faqat shu xodimning o'z yozuvlarini o'qiydi. Avval ilova buni o'zi
/// hisoblardi: buyurtmalar ro'yxati bo'ylab yurib, HAR BIRIGA mahsulotlar
/// uchun alohida obuna ochardi — profilni ochish o'nlab jonli obunani
/// ishga tushirardi.
///
/// Ish bo'lmasa raqam emas, "Yo'q" yoziladi (talab) — nol raqam "hisob
/// ishlamayapti" degan taassurot qoldirardi.
class TodayActivitySection extends ConsumerWidget {
  final String? departmentKey;

  /// Sotuv menejeri bo'lmasa ham buyurtma ocha oladigan xodimlar bor.
  final bool canCreateOrders;

  const TodayActivitySection({super.key, required this.departmentKey, required this.canCreateOrders});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myDailyActivityProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Bugungi ish',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
            ),
            IconButton(
              onPressed: () => ref.invalidate(myDailyActivityProvider),
              icon: const Icon(Icons.refresh_rounded, size: 20, color: AppColors.grayDark),
              tooltip: 'Yangilash',
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
        const SizedBox(height: 4),
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(child: SeltaLoader(size: 32)),
          ),
          error: (err, _) => _ErrorBox(onRetry: () => ref.invalidate(myDailyActivityProvider)),
          data: (a) => _Body(activity: a, departmentKey: departmentKey, canCreateOrders: canCreateOrders),
        ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  final MyDailyActivity activity;
  final String? departmentKey;
  final bool canCreateOrders;

  const _Body({required this.activity, required this.departmentKey, required this.canCreateOrders});

  @override
  Widget build(BuildContext context) {
    final isDelivery = departmentKey == 'delivery';
    final isWorker = departmentKey == 'worker';
    final isDispatcher = departmentKey == 'dispatcher';

    final cards = <Widget>[
      if (isDelivery) ...[
        _ActivityCard(
          icon: Icons.local_shipping_rounded,
          tone: AppColors.primary,
          label: 'Sexga olib keldi',
          count: activity.broughtInCount,
          countLabel: 'buyurtma',
          detail: activity.broughtInCount > 0 ? formatMoneyUz(activity.broughtInTotal) : null,
          onView: activity.broughtInCount == 0
              ? null
              : () => openTodayActivityList(context, kind: TodayListKind.broughtIn, activity: activity),
        ),
        _ActivityCard(
          icon: Icons.check_circle_rounded,
          tone: AppColors.success,
          label: 'Mijozga yetkazdi',
          count: activity.deliveredCount,
          countLabel: 'mahsulot',
          detail: activity.deliveredCount > 0
              ? '${activity.deliveredOrderCount} ta buyurtma · ${formatMoneyUz(activity.deliveredTotal)}'
              : null,
          onView: activity.deliveredCount == 0
              ? null
              : () => openTodayActivityList(context, kind: TodayListKind.delivered, activity: activity),
        ),
      ],
      if (isWorker) ...[
        _ActivityCard(
          icon: Icons.water_drop_rounded,
          tone: AppColors.info,
          label: 'Yuvdi',
          count: activity.washedCount,
          countLabel: 'mahsulot',
          totals: activity.washedTotals,
          onView: activity.washedCount == 0
              ? null
              : () => openTodayActivityList(context, kind: TodayListKind.washed, activity: activity),
        ),
        _ActivityCard(
          icon: Icons.inventory_2_rounded,
          tone: AppColors.warning,
          label: 'Upakovka qildi',
          count: activity.packedCount,
          countLabel: 'mahsulot',
          totals: activity.packedTotals,
          onView: activity.packedCount == 0
              ? null
              : () => openTodayActivityList(context, kind: TodayListKind.packed, activity: activity),
        ),
      ],
      if (isDispatcher || canCreateOrders)
        _ActivityCard(
          icon: Icons.note_add_rounded,
          tone: AppColors.secondary,
          label: 'Buyurtma ochdi',
          count: activity.createdCount,
          countLabel: 'buyurtma',
          detail: activity.createdCount > 0 ? formatMoneyUz(activity.createdTotal) : null,
          onView: activity.createdCount == 0
              ? null
              : () => openTodayActivityList(context, kind: TodayListKind.created, activity: activity),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final card in cards) ...[card, const SizedBox(height: 10)],
        if (isDelivery) _MoneySummary(activity: activity),
      ],
    );
  }
}

/// Dastavchik uchun pul xulosasi — qo'lidagi naqd, qarz, qisman va
/// chegirma. Nol bo'lganlari umuman ko'rsatilmaydi (ortiqcha so'z yo'q).
class _MoneySummary extends StatelessWidget {
  final MyDailyActivity activity;
  const _MoneySummary({required this.activity});

  @override
  Widget build(BuildContext context) {
    final tiles = <Widget>[
      _MoneyTile(label: 'Qo\'lingizda', value: formatMoneyUz(activity.cash), tone: AppColors.ink),
      if (activity.debt.count > 0)
        _MoneyTile(
          label: 'Qarz (${activity.debt.count})',
          value: formatMoneyUz(activity.debt.amount),
          tone: AppColors.danger,
        ),
      if (activity.partial.count > 0)
        _MoneyTile(
          label: 'Qisman (${activity.partial.count})',
          value: formatMoneyUz(activity.partial.amount),
          tone: AppColors.warning,
        ),
      if (activity.discount.count > 0)
        _MoneyTile(
          label: 'Chegirma (${activity.discount.count})',
          value: formatMoneyUz(activity.discount.amount),
          tone: AppColors.info,
        ),
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < tiles.length; i++) ...[
            if (i > 0) const Divider(height: 18, color: AppColors.border),
            tiles[i],
          ],
          if (activity.payments.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => openTodayActivityList(context, kind: TodayListKind.payments, activity: activity),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: const BorderSide(color: AppColors.border),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text("To'lovlarni ko'rish", style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MoneyTile extends StatelessWidget {
  final String label;
  final String value;
  final Color tone;
  const _MoneyTile({required this.label, required this.value, required this.tone});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
        ),
        Text(value, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: tone)),
      ],
    );
  }
}

class _ActivityCard extends StatelessWidget {
  final IconData icon;
  final Color tone;
  final String label;
  final int count;
  final String countLabel;
  final String? detail;
  final List<UnitAmount>? totals;
  final VoidCallback? onView;

  const _ActivityCard({
    required this.icon,
    required this.tone,
    required this.label,
    required this.count,
    required this.countLabel,
    this.detail,
    this.totals,
    this.onView,
  });

  @override
  Widget build(BuildContext context) {
    final empty = count == 0;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(color: tone.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 17, color: tone),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink),
                ),
              ),
              // Ish bo'lmasa raqam emas, "Yo'q" (talab).
              if (empty)
                const Text(
                  "Yo'q",
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.gray),
                )
              else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text('$count', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: tone)),
                    const SizedBox(width: 4),
                    Text(
                      'ta $countLabel',
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.grayDark),
                    ),
                  ],
                ),
            ],
          ),
          if (!empty && (totals?.isNotEmpty ?? false)) ...[
            const SizedBox(height: 10),
            // Har bir birlik ALOHIDA qatorda: m², kg va dona bir-biriga
            // qo'shilmaydi, bitta satrda ular bitta qiymatdek o'qilardi.
            for (final t in totals!)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  children: [
                    Text(
                      '${_trimNumber(t.amount)} ',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink),
                    ),
                    Text(t.label, style: const TextStyle(fontSize: 12, color: AppColors.grayDark)),
                  ],
                ),
              ),
          ],
          if (!empty && detail != null) ...[
            const SizedBox(height: 6),
            Text(detail!, style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
          ],
          if (onView != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onView,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: const BorderSide(color: AppColors.border),
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text("Ko'rish", style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// "12.50" emas, "12.5"; butun son bo'lsa kasr qismi umuman yozilmaydi.
String _trimNumber(num value) {
  if (value == value.roundToDouble()) return value.round().toString();
  return value.toStringAsFixed(2).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
}

class _ErrorBox extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorBox({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              "Bugungi ishni yuklab bo'lmadi",
              style: TextStyle(fontSize: 13, color: AppColors.grayDark, fontWeight: FontWeight.w600),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Qayta urinish')),
        ],
      ),
    );
  }
}

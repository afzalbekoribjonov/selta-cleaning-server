import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';
import 'order_detail_sheet.dart';
import 'widgets/order_card.dart';

/// Xizmat turi bo'yicha filtr — talab: tarif filtrlari (Express/Premium/...)
/// va "Kechikkan" olib tashlanib, o'rniga buyurtma turlari chiqsin, har
/// birining o'ng yuqori burchagida nechtaligi ko'rinib tursin.
enum _ServiceFilter { all, onsite, pickup, walkin }

const _serviceLabels = {
  _ServiceFilter.all: 'Barchasi',
  _ServiceFilter.onsite: 'Joyida yuvish',
  _ServiceFilter.pickup: 'Olib kelish',
  _ServiceFilter.walkin: "O'zi keldi",
};

const _serviceIcons = {
  _ServiceFilter.all: Icons.grid_view_rounded,
  _ServiceFilter.onsite: Icons.home_repair_service_rounded,
  _ServiceFilter.pickup: Icons.local_shipping_rounded,
  _ServiceFilter.walkin: Icons.storefront_rounded,
};

/// "O'zi keldi" — pickup buyurtma, lekin dastavchiksiz (server:
/// intakeMethod == 'walk_in'), shuning uchun "Olib kelish"dan alohida.
bool _matchesService(Order o, _ServiceFilter f) {
  switch (f) {
    case _ServiceFilter.onsite:
      return o.serviceType == 'onsite';
    case _ServiceFilter.pickup:
      return o.serviceType == 'pickup' && o.intakeMethod != 'walk_in';
    case _ServiceFilter.walkin:
      return o.intakeMethod == 'walk_in';
    case _ServiceFilter.all:
      return true;
  }
}

bool _needsTeam(Order o) => o.serviceType == 'onsite' && o.status == 'new' && o.assignedTeam.isEmpty;

/// Sotuv menejerining "Faol buyurtmalar" bo'limi — xizmat turi bo'yicha
/// filtrlanadi; qidiruvda YAKUNLANGAN buyurtmalar ham topiladi (talab).
class ActiveOrdersTab extends ConsumerStatefulWidget {
  const ActiveOrdersTab({super.key});

  @override
  ConsumerState<ActiveOrdersTab> createState() => _ActiveOrdersTabState();
}

class _ActiveOrdersTabState extends ConsumerState<ActiveOrdersTab> {
  String _search = '';
  _ServiceFilter _service = _ServiceFilter.all;

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(ordersProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            decoration: InputDecoration(
              hintText: "Ism, telefon yoki # bo'yicha qidirish",
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
              filled: true,
              fillColor: AppColors.surface,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: AppColors.border),
              ),
            ),
          ),
        ),
        Expanded(
          child: ordersAsync.when(
            loading: () => const SeltaLoadingView(),
            error: (err, _) => Center(child: Text('Xatolik: $err')),
            data: (allOrders) {
              // Talab: "yetgazilgan (yakunlangan) buyurtmalar ham qidiruv
              // orqali qidirilganda ko'rinsin" — qidiruv paytida
              // yakunlanganlar ham qamrab olinadi, aks holda faqat faollar.
              final base = _search.isEmpty ? allOrders.where((o) => !o.isDone).toList() : allOrders;

              final searched = _search.isEmpty
                  ? base
                  : base
                      .where((o) =>
                          o.customerName.toLowerCase().contains(_search) ||
                          o.phone.toLowerCase().contains(_search) ||
                          o.orderNumber.toString().contains(_search))
                      .toList();

              final counts = {
                for (final f in _ServiceFilter.values) f: searched.where((o) => _matchesService(o, f)).length,
              };

              final filtered = searched.where((o) => _matchesService(o, _service)).toList()
                ..sort((a, b) {
                  // Jamoa kutayotgan buyurtmalar doim tepada — ular
                  // shoshilinch (jamoa hali yo'lga chiqmagan).
                  final at = _needsTeam(a);
                  final bt = _needsTeam(b);
                  if (at != bt) return at ? -1 : 1;
                  if (a.isOverdue != b.isOverdue) return a.isOverdue ? -1 : 1;
                  return b.createdAt.compareTo(a.createdAt);
                });

              final unassigned = allOrders.where((o) => !o.isDone && _needsTeam(o)).length;

              return Column(
                children: [
                  if (unassigned > 0 && _search.isEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: _UnassignedBanner(
                        count: unassigned,
                        onTap: () => setState(() => _service = _ServiceFilter.onsite),
                      ),
                    ),
                  SizedBox(
                    height: 48,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      children: [
                        for (final f in _ServiceFilter.values) ...[
                          _ServiceChip(
                            label: _serviceLabels[f]!,
                            icon: _serviceIcons[f]!,
                            count: counts[f] ?? 0,
                            selected: _service == f,
                            onTap: () => setState(() => _service = f),
                          ),
                          const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Expanded(
                    child: filtered.isEmpty
                        ? const _EmptyState()
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (context, i) {
                              final order = filtered[i];
                              return OrderCard(
                                order: order,
                                onTap: () => openOrderDetailSheet(context, order),
                              );
                            },
                          ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Filtr tugmasi — o'ng yuqori burchagida nechta buyurtma borligi (talab).
class _ServiceChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _ServiceChip({
    required this.label,
    required this.icon,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      // Burchakdagi son kesilib qolmasligi uchun tepada/o'ngda bo'sh joy.
      padding: const EdgeInsets.only(top: 8, right: 6),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Material(
            color: selected ? AppColors.primary : AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: onTap,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: selected ? AppColors.primary : AppColors.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 14, color: selected ? Colors.white : AppColors.primary),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: TextStyle(
                        color: selected ? Colors.white : AppColors.ink,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: -8,
            right: -6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              constraints: const BoxConstraints(minWidth: 20),
              decoration: BoxDecoration(
                color: selected ? AppColors.accent : AppColors.primary,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.bg, width: 1.5),
              ),
              child: Text(
                '$count',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w900,
                  color: selected ? AppColors.ink : Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Talab: jamoa biriktirilmagan buyurtmalar "qizarib danger holatda yonib
/// o'chib" turishi kerak. Nafas olayotgandek silliq o'zgaradi (keskin
/// miltillash emas) — uzoq tikilib turiladigan ro'yxatda charchatmasligi
/// uchun.
class _UnassignedBanner extends StatefulWidget {
  final int count;
  final VoidCallback onTap;
  const _UnassignedBanner({required this.count, required this.onTap});

  @override
  State<_UnassignedBanner> createState() => _UnassignedBannerState();
}

class _UnassignedBannerState extends State<_UnassignedBanner> with SingleTickerProviderStateMixin {
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
      opacity: Tween<double>(begin: 0.55, end: 1).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Material(
        color: AppColors.danger.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: widget.onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.danger, width: 1.5),
            ),
            child: Row(
              children: [
                const Icon(Icons.groups_rounded, size: 17, color: AppColors.danger),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${widget.count} ta buyurtmaga jamoa biriktirilmagan',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.danger),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.danger),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inbox_rounded, size: 48, color: AppColors.gray),
            SizedBox(height: 12),
            Text('Buyurtmalar topilmadi', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

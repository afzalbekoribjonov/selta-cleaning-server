import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';
import 'order_detail_sheet.dart';
import 'widgets/order_card.dart';

const _tariffOrder = ['express', 'premium', 'comfort', 'standart'];

int _tariffWeight(String tariff) {
  final i = _tariffOrder.indexOf(tariff);
  return i == -1 ? _tariffOrder.length : i;
}

/// Dispetcherning "Faol buyurtmalar" bo'limi — talab #5: o'ziga tegishli
/// filter asosida tartiblanishi kerak. Qidiruv, tarif filtri va
/// "kechikkanlar" filtri bilan.
class ActiveOrdersTab extends ConsumerStatefulWidget {
  const ActiveOrdersTab({super.key});

  @override
  ConsumerState<ActiveOrdersTab> createState() => _ActiveOrdersTabState();
}

class _ActiveOrdersTabState extends ConsumerState<ActiveOrdersTab> {
  String _search = '';
  String? _tariffFilter;
  bool _overdueOnly = false;

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(recentOrdersProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            decoration: InputDecoration(
              hintText: 'Ism, telefon yoki # bo\'yicha qidirish',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              isDense: true,
              filled: true,
              fillColor: AppColors.surface,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.border)),
            ),
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              _FilterChip(
                label: 'Barchasi',
                selected: _tariffFilter == null && !_overdueOnly,
                onTap: () => setState(() {
                  _tariffFilter = null;
                  _overdueOnly = false;
                }),
              ),
              const SizedBox(width: 8),
              for (final t in kTariffConfigKeys) ...[
                _FilterChip(
                  label: kTariffConfig[t]!.label,
                  selected: _tariffFilter == t,
                  color: kTariffConfig[t]!.color,
                  onTap: () => setState(() {
                    _tariffFilter = _tariffFilter == t ? null : t;
                    _overdueOnly = false;
                  }),
                ),
                const SizedBox(width: 8),
              ],
              _FilterChip(
                label: 'Kechikkan',
                selected: _overdueOnly,
                color: AppColors.danger,
                icon: Icons.warning_rounded,
                onTap: () => setState(() {
                  _overdueOnly = !_overdueOnly;
                  if (_overdueOnly) _tariffFilter = null;
                }),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: ordersAsync.when(
            loading: () => const SeltaLoadingView(),
            error: (err, _) => Center(child: Text('Xatolik: $err')),
            data: (orders) {
              var filtered = orders.where((o) => o.status != 'done').toList();

              if (_search.isNotEmpty) {
                filtered = filtered.where((o) {
                  return o.customerName.toLowerCase().contains(_search) ||
                      o.phone.toLowerCase().contains(_search) ||
                      o.orderNumber.toString().contains(_search);
                }).toList();
              }
              if (_tariffFilter != null) {
                filtered = filtered.where((o) => o.tariff == _tariffFilter).toList();
              }
              if (_overdueOnly) {
                filtered = filtered.where((o) => o.isOverdue).toList();
              }

              filtered.sort((a, b) {
                if (a.isOverdue != b.isOverdue) return a.isOverdue ? -1 : 1;
                final tw = _tariffWeight(a.tariff).compareTo(_tariffWeight(b.tariff));
                if (tw != 0) return tw;
                return b.createdAt.compareTo(a.createdAt);
              });

              if (filtered.isEmpty) {
                return const _EmptyState();
              }

              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final order = filtered[i];
                  return OrderCard(order: order, onTap: () => openOrderDetailSheet(context, order));
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

const kTariffConfigKeys = ['express', 'premium', 'comfort', 'standart'];

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color? color;
  final IconData? icon;
  final VoidCallback onTap;

  const _FilterChip({required this.label, required this.selected, this.color, this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final activeColor = color ?? AppColors.primary;
    return Material(
      color: selected ? activeColor : AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? activeColor : AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: selected ? Colors.white : activeColor),
                const SizedBox(width: 5),
              ],
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
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inbox_rounded, size: 48, color: AppColors.gray),
            const SizedBox(height: 12),
            const Text('Buyurtmalar topilmadi', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

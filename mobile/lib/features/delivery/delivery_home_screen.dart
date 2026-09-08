import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/launch_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_jobs_section.dart';
import 'delivery_order_detail_sheet.dart';

// Talab: dastavchik mijozdan olgach, alohida "Qabul qilindi" bosqichisiz
// to'g'ridan-to'g'ri ishchilar navbatiga o'tadi — bu oraliq bosqich
// qo'shimcha ish talab qilgani uchun tab sifatida olib tashlandi.
const _stages = [
  ('new', 'Yangi', Icons.move_to_inbox_rounded),
  ('ready', 'Yetkazishga tayyor', Icons.done_all_rounded),
];

/// "Yetkazishga tayyor" endi order-level status emas — har bir item
/// mustaqil ravishda "ready"ga yetadi (talab #9). Shu bosqichdagi
/// buyurtmalar — "brought_in"da turgan VA kamida bitta "ready" itemga
/// ega bo'lganlar.
/// Buyurtmada yetkazishga tayyor mahsulot bormi — buyurtmadagi HOSILA
/// maydondan (server: lib/orderSummary.ts). Avval bu har bir buyurtma
/// uchun alohida `items` obunasini talab qilardi.
bool _hasReadyItem(Order order) => (order.itemStatusCounts['ready'] ?? 0) > 0;

/// Dastavchik paneli — olib ketish (new -> brought_in, bitta bosqichda,
/// GPS bilan) jarayonini boshqaradi; yetkazib berish endi ITEM-darajasida (talab
/// #9: qisman yetkazish) — "Yetkazishga tayyor" tabida kamida bitta
/// "ready" itemga ega buyurtmalar ko'rsatiladi.
class DeliveryHomeScreen extends ConsumerStatefulWidget {
  const DeliveryHomeScreen({super.key});

  @override
  ConsumerState<DeliveryHomeScreen> createState() => _DeliveryHomeScreenState();
}

class _DeliveryHomeScreenState extends ConsumerState<DeliveryHomeScreen> {
  int _stageIndex = 0;
  String _search = '';

  /// Firestore'dan topilgan, ilova keshida yo'q buyurtmalar.
  ///
  /// Qidiruv AVVAL keshdan (faol va oxirgi yuklangan buyurtmalar) izlaydi
  /// — odatdagi holat shu va u bitta ham qo'shimcha o'qishga sabab
  /// bo'lmaydi. Faqat keshda hech narsa topilmaganda serverga murojaat
  /// qilinadi: raqam bo'yicha aniq moslik, telefon esa faqat TO'LIQ
  /// kiritilganda.
  List<Order> _remote = const [];
  bool _searching = false;
  String _remoteFor = '';

  /// `build` ichidan chaqiriladi, shuning uchun holat qurish tugagandan
  /// KEYIN o'zgartiriladi — aks holda "setState() called during build"
  /// istisnosi tushardi.
  void _scheduleRemoteSearch(String term) {
    if (term.isEmpty || _remoteFor == term || _searching) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _searchRemote(term));
  }

  Future<void> _searchRemote(String term) async {
    if (!mounted || term.isEmpty || _remoteFor == term) return;
    setState(() {
      _searching = true;
      _remoteFor = term;
    });
    try {
      final found = await ref.read(ordersRepositoryProvider).searchOrders(term);
      if (mounted && _remoteFor == term) {
        setState(() {
          _remote = found.where((o) => o.serviceType == 'pickup').toList();
          _searching = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(ordersProvider);
    final stage = _stages[_stageIndex].$1;

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Dastavchik', employeeName: fullName),
      body: Column(
        children: [
          const TeamJobsSection(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() {
                _search = v.trim().toLowerCase();
                _remote = const [];
                _remoteFor = '';
                _searching = false;
              }),
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
          Expanded(
            child: ordersAsync.when(
              loading: () => const SeltaLoadingView(),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                var filtered = stage == 'ready'
                    ? orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in' && _hasReadyItem(o)).toList()
                    : orders.where((o) => o.serviceType == 'pickup' && o.status == stage).toList();

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                // Qidiruv joriy tabga cheklanmaydi: avval butun keshdan
                // (boshqa bosqichlardan ham) izlanadi.
                if (filtered.isEmpty && _search.isNotEmpty) {
                  final elsewhere = orders
                      .where((o) =>
                          o.serviceType == 'pickup' &&
                          (o.orderNumber.toString().contains(_search) ||
                              o.phone.toLowerCase().contains(_search) ||
                              o.customerName.toLowerCase().contains(_search)))
                      .toList();
                  if (elsewhere.isNotEmpty) {
                    return _SearchResults(title: 'Boshqa bosqichda topildi', orders: elsewhere);
                  }

                  // Keshda yo'q — endi Firestore'dan.
                  _scheduleRemoteSearch(_search);
                  // So'rov hali yakunlanmagan bo'lsa yuklanish ko'rsatiladi:
                  // aks holda natija kelgunga qadar bir lahza "topilmadi"
                  // yonib ketardi.
                  final done = _remoteFor == _search && !_searching;
                  if (!done) return const SeltaLoadingView();
                  if (_remote.isNotEmpty) {
                    return _SearchResults(title: 'Bazadan topildi', orders: _remote);
                  }
                  return const Center(
                    child: Text('Buyurtma topilmadi', style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
                  );
                }

                if (filtered.isEmpty) {
                  return const Center(
                    child: Text('Bu bo\'limda buyurtma yo\'q', style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600)),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final order = filtered[i];
                    return OrderCard(
                      order: order,
                      onTap: () => openDeliveryOrderDetailSheet(context, order),
                      emphasizePrice: stage == 'ready',
                      actions: [
                        CardActionButton(icon: Icons.call_rounded, label: "Qo'ng'iroq", onTap: () => callPhone(order.phone)),
                        if (stage == 'ready' && order.gpsCoords != null && order.gpsCoords!.isNotEmpty)
                          CardActionButton(icon: Icons.navigation_rounded, label: "Yo'lga chiqish", filled: true, onTap: () => navigateToGps(order.gpsCoords!)),
                      ],
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: ordersAsync.when(
        loading: () => null,
        error: (_, __) => null,
        data: (orders) {
          final pickupOrders = orders.where((o) => o.serviceType == 'pickup').toList();
          final broughtIn = pickupOrders.where((o) => o.status == 'brought_in').toList();
          int countFor(String s) =>
              s == 'ready' ? broughtIn.where((o) => _hasReadyItem(o)).length : pickupOrders.where((o) => o.status == s).length;
          return NavigationBar(
            selectedIndex: _stageIndex,
            onDestinationSelected: (i) => setState(() => _stageIndex = i),
            destinations: [
              for (final (s, label, icon) in _stages) NavigationDestination(icon: _BadgedIcon(icon: icon, count: countFor(s)), label: label),
            ],
          );
        },
      ),
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  final IconData icon;
  final int count;
  const _BadgedIcon({required this.icon, required this.count});

  @override
  Widget build(BuildContext context) {
    if (count == 0) return Icon(icon);
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      backgroundColor: AppColors.danger,
      child: Icon(icon),
    );
  }
}


/// Qidiruv natijalari — joriy bosqichdan tashqarida topilganlar.
class _SearchResults extends StatelessWidget {
  final String title;
  final List<Order> orders;

  const _SearchResults({required this.title, required this.orders});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            title,
            style: const TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w700, fontSize: 12.5),
          ),
        ),
        for (final order in orders) ...[
          OrderCard(order: order, onTap: () => openDeliveryOrderDetailSheet(context, order)),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

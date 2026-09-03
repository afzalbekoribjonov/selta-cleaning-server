import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_jobs_section.dart';
import 'worker_order_detail_sheet.dart';

const _workerStages = ['pending', 'washing', 'packing', 'returned'];
const _stageIcons = {
  'pending': Icons.hourglass_empty_rounded,
  'washing': Icons.local_laundry_service_rounded,
  'packing': Icons.inventory_rounded,
  'returned': Icons.replay_rounded,
};


/// Ishchi paneli — talab #3/#5/#8/#10: har bir mahsulot mustaqil ravishda
/// pending -> washing -> packing -> ready/returned bosqichlaridan o'tadi.
/// Ro'yxatda BUYURTMA kartalari ko'rsatiladi (bir buyurtma — bir karta,
/// item-item emas) — karta ochilganda o'sha buyurtmaning barcha
/// mahsulotlari (har xil bosqichda bo'lsa ham) ko'rinadi. "Sifat
/// nazorati" bo'limi olib tashlangan — "packing" bosqichida upakovkachi
/// huquqi bor ishchi ✅/❌ bosa oladi. "pending"/"washing" bosqichlarida
/// xodim faqat o'z mutaxassisligiga mos mahsuloti bor buyurtmalarni
/// ko'radi (talab #6) — lavozimi bo'lmagan xodim hech narsa o'zgartira
/// olmaydi (ItemActionRow shuni ta'minlaydi).
class WorkerHomeScreen extends ConsumerStatefulWidget {
  const WorkerHomeScreen({super.key});

  @override
  ConsumerState<WorkerHomeScreen> createState() => _WorkerHomeScreenState();
}

class _WorkerHomeScreenState extends ConsumerState<WorkerHomeScreen> {
  int _stageIndex = 0;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final employeeAsync = ref.watch(currentEmployeeProvider);
    final fullName = employeeAsync.value?['fullName'] as String? ?? '...';
    final specializations =
        (employeeAsync.value?['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    // Talab: admin joyida-yuvishga ixtisoslashgan ishchi uchun sexga
    // keladigan (pickup) buyurtmalar navbatini yashirishi mumkin bo'lishi
    // kerak — standart holat true (avvalgi xatti-harakat).
    final canSeeWorkshopQueue = employeeAsync.value?['canSeeWorkshopQueue'] as bool? ?? true;
    final ordersAsync = ref.watch(ordersProvider);
    final stage = _workerStages[_stageIndex];

    if (!canSeeWorkshopQueue) {
      return Scaffold(
        appBar: EmployeeAppBar(departmentLabel: 'Ishchi', employeeName: fullName),
        body: const Column(
          children: [
            TeamJobsSection(),
            Expanded(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    "Sizga joyida yuvish ishi biriktirilganda shu yerda ko'rinadi",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Ishchi', employeeName: fullName),
      body: Column(
        children: [
          const TeamJobsSection(),
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
          Expanded(
            child: ordersAsync.when(
              loading: () => const SeltaLoadingView(),
              error: (err, _) => Center(child: Text('Xatolik: $err')),
              data: (orders) {
                final activeOrders = orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in').toList();
                // Talab: bu bosqichda bitta buyurtma uchun BITTA karta —
                // item-item emas. Karta bosilganda buyurtma ichidagi
                // BARCHA mahsulotlar (boshqa bosqichdagilar ham) ko'rinadi.
                var filtered = _ordersForStage(activeOrders, stage, specializations);

                if (_search.isNotEmpty) {
                  filtered = filtered.where((o) {
                    return o.customerName.toLowerCase().contains(_search) ||
                        o.phone.toLowerCase().contains(_search) ||
                        o.orderNumber.toString().contains(_search);
                  }).toList();
                }

                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                // Talab #11: buyurtma raqami bo'yicha qidiruv joriy
                // bosqich (tab)ga cheklanmasin — boshqa bosqichdagi
                // buyurtma ham topilishi va ochilishi kerak.
                final searchNumber = RegExp(r'^\d+$').hasMatch(_search) ? int.tryParse(_search) : null;
                if (filtered.isEmpty && searchNumber != null) {
                  final elsewhere = orders.where((o) => o.orderNumber == searchNumber && o.serviceType == 'pickup').toList();
                  if (elsewhere.isNotEmpty) {
                    return ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: Text('Boshqa bosqichda topildi', style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w700, fontSize: 12.5)),
                        ),
                        for (final order in elsewhere) ...[
                          OrderCard(order: order, onTap: () => openWorkerOrderDetailSheet(context, order)),
                          const SizedBox(height: 10),
                        ],
                      ],
                    );
                  }
                }

                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      stage == 'returned' ? "Qaytarilgan mahsulot yo'q" : 'Bu bosqichda buyurtma yo\'q',
                      style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final order = filtered[i];
                    return OrderCard(order: order, onTap: () => openWorkerOrderDetailSheet(context, order));
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
          final activeOrders = orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in').toList();

          return NavigationBar(
            selectedIndex: _stageIndex,
            onDestinationSelected: (i) => setState(() => _stageIndex = i),
            destinations: [
              for (final s in _workerStages)
                NavigationDestination(
                  icon: _BadgedIcon(icon: _stageIcons[s]!, count: _ordersForStage(activeOrders, s, specializations).length),
                  label: kStatusConfig[s]!.label,
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Shu bosqichda kamida bitta mos itemga ega BUYURTMALAR ro'yxati (bir
/// buyurtma — bir karta). Karta ochilganda esa
/// (worker_order_detail_sheet) o'sha buyurtmaning BARCHA itemlari, qaysi
/// bosqichda bo'lishidan qat'i nazar, ko'rinadi.
///
/// Filtr endi buyurtmadagi HOSILA maydonlardan hisoblanadi
/// (`itemStatusCounts` / `itemStageCategories`, server:
/// lib/orderSummary.ts). Avval har bir buyurtmaning mahsulotlariga
/// alohida obuna ochilardi — ro'yxatda yuzlab buyurtma bo'lganda bu
/// Firestore kunlik o'qish limitini tugatib qo'ygan asosiy sabablardan
/// biri edi.
List<Order> _ordersForStage(List<Order> orders, String stage, List<String> specializations) {
  final restrictBySpecialization = stage == 'pending' || stage == 'washing';
  final result = <Order>[];
  for (final order in orders) {
    if ((order.itemStatusCounts[stage] ?? 0) == 0) continue;
    if (restrictBySpecialization && specializations.isNotEmpty) {
      final cats = order.itemStageCategories[stage] ?? const <String>[];
      // '_none' — toifasi belgilanmagan mahsulot, u hammaga ko'rinadi
      // (server: assertWorkerLavozim bilan bir xil qoida).
      final matches = cats.any((c) => c == '_none' || specializations.contains(c));
      if (!matches) continue;
    }
    result.add(order);
  }
  return result;
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/warnings_banner.dart';
import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/widgets/app_bottom_nav.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_jobs_section.dart';
import 'worker_order_detail_sheet.dart';
import '../../core/widgets/load_error_note.dart';

const _workerStages = ['pending', 'washing', 'packing', 'returned'];
/// Qisqa nomlar — pastki menyuda bir qatorga sig'adi.
const _stageLabels = {
  'pending': 'Navbatda',
  'washing': 'Yuvish',
  'packing': 'Upakovka',
  'returned': 'Qaytarilgan',
};

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
            WarningsBanner(),
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
          const WarningsBanner(),
          const TeamJobsSection(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              decoration: InputDecoration(
                hintText: "Shu bo'limdan: ism, telefon yoki #",
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
              error: (err, _) => LoadErrorNote(error: err, centered: true),
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

                // Qidiruv faqat JORIY bosqichdan (talab). Butun bazadan
                // qidirish — yuqori o'ngdagi umumiy qidiruvda.
                filtered.sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (filtered.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 64,
                            height: 64,
                            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
                            child: Icon(_stageIcons[stage], size: 30, color: AppColors.primary),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _search.isNotEmpty
                                ? 'Topilmadi'
                                : stage == 'returned'
                                    ? "Qaytarilgan mahsulot yo'q"
                                    : "${_stageLabels[stage]} bosqichida buyurtma yo'q",
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700, fontSize: 14.5),
                          ),
                        ],
                      ),
                    ),
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
                      onTap: () => openWorkerOrderDetailSheet(context, order),
                      onCommentTap: () => openWorkerOrderDetailSheet(context, order, focusComments: true),
                      facts: [CardFact.stages(order)],
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      // Menyu yuklanish paytida ham turadi (sonlarsiz) — avval u
      // ma'lumot kelguncha yo'q bo'lib, keyin paydo bo'lar va butun
      // sahifa pastga-yuqoriga "sakrardi".
      bottomNavigationBar: Builder(builder: (context) {
        final orders = ordersAsync.valueOrNull ?? const <Order>[];
        final activeOrders = orders.where((o) => o.serviceType == 'pickup' && o.status == 'brought_in').toList();
        return AppBottomNav(
          currentIndex: _stageIndex,
          onSelect: (i) => setState(() => _stageIndex = i),
          items: [
            for (final s in _workerStages)
              AppNavItem(
                label: _stageLabels[s]!,
                icon: _stageIcons[s]!,
                count: _ordersForStage(activeOrders, s, specializations).length,
              ),
          ],
        );
      }),
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


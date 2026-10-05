import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/my_activity_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/warehouse_settings.dart';
import '../../core/sync/action_queue.dart';
import '../../core/sync/pending_action.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/selta_loader.dart';
import '../dispatcher/widgets/order_card.dart';
import '../shared/employee_app_bar.dart';
import '../shared/team_jobs_section.dart';
import 'delivery_buckets.dart';
import 'delivery_order_detail_sheet.dart';
import '../../core/sync/fast_get.dart';

enum _Tab { fresh, almost, ready, delivered }

const _tabs = [
  (_Tab.fresh, 'Yangi', Icons.move_to_inbox_rounded),
  (_Tab.almost, 'Deyarli tayyor', Icons.hourglass_bottom_rounded),
  (_Tab.ready, 'Tayyor', Icons.done_all_rounded),
  (_Tab.delivered, 'Yetgazildi', Icons.local_shipping_rounded),
];

/// Har bir bo'limga MAZMUNAN tegishli tartiblar. "Yangi"da narx va
/// muddat hali ahamiyatsiz (mahsulotlar o'lchanmagan), "Yetgazildi"da esa
/// masofa ma'nosiz — pul allaqachon olingan.
const _sortsFor = {
  _Tab.fresh: [DeliverySort.all, DeliverySort.date, DeliverySort.distance],
  _Tab.almost: DeliverySort.values,
  _Tab.ready: DeliverySort.values,
  _Tab.delivered: [DeliverySort.all, DeliverySort.priceHigh, DeliverySort.priceLow],
};

/// Dastavchik paneli — to'rt bo'lim:
///  - Yangi          — mijozdan olib kelinishi kerak;
///  - Deyarli tayyor — mahsulotlarning bir qismi tayyor (masalan 4 tadan 2);
///  - Tayyor         — qolgan mahsulotlarning hammasi tayyor, olib borish mumkin;
///  - Yetgazildi     — aynan BUGUN shu dastavchik topshirganlari.
///
/// Birinchi uchtasi buyurtma xulosasidan (`itemStatusCounts`) hisoblanadi
/// — mahsulotlarni o'qimaydi. Qidiruv faqat JORIY bo'lim ichida; butun
/// bazadan qidirish — yuqoridagi umumiy qidiruvda.
class DeliveryHomeScreen extends ConsumerStatefulWidget {
  const DeliveryHomeScreen({super.key});

  @override
  ConsumerState<DeliveryHomeScreen> createState() => _DeliveryHomeScreenState();
}

class _DeliveryHomeScreenState extends ConsumerState<DeliveryHomeScreen> {
  _Tab _tab = _Tab.fresh;
  String _search = '';
  final Map<_Tab, DeliverySort> _sort = {for (final t in _Tab.values) t: DeliverySort.all};

  /// Dastavchikning joylashuvi — faqat "Masofa" tanlanganda so'raladi va
  /// bir necha daqiqa eslab qolinadi (har safar GPS'ni yoqmaslik uchun).
  LatLng? _position;
  DateTime? _positionAt;
  bool _locating = false;
  String? _locationError;

  bool get _positionFresh =>
      _position != null && _positionAt != null && DateTime.now().difference(_positionAt!) < const Duration(minutes: 3);

  Future<void> _ensurePosition() async {
    if (_positionFresh || _locating) return;
    setState(() {
      _locating = true;
      _locationError = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw "Telefonda joylashuv (GPS) o'chiq";
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw 'Joylashuv ruxsati berilmadi — sozlamalardan yoqing';
      }
      // Avval oxirgi ma'lum joylashuv — darhol natija; aniqrog'i keyin.
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && mounted) {
        setState(() => _position = (lat: last.latitude, lng: last.longitude));
      }
      final current = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 15)),
      );
      if (!mounted) return;
      setState(() {
        _position = (lat: current.latitude, lng: current.longitude);
        _positionAt = DateTime.now();
      });
    } catch (e) {
      if (mounted && _position == null) {
        setState(() => _locationError = e is String ? e : "Joylashuvni aniqlab bo'lmadi");
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _selectSort(DeliverySort sort) {
    setState(() => _sort[_tab] = sort);
    if (sort == DeliverySort.distance) _ensurePosition();
  }

  bool _matches(Order o) {
    if (_search.isEmpty) return true;
    return o.customerName.toLowerCase().contains(_search) ||
        o.phone.contains(_search) ||
        o.orderNumber.toString().contains(_search);
  }

  @override
  Widget build(BuildContext context) {
    final fullName = ref.watch(currentEmployeeProvider).valueOrNull?['fullName'] as String? ?? '...';
    final ordersAsync = ref.watch(ordersProvider);
    final orders = ordersAsync.valueOrNull ?? const <Order>[];
    final warehouseDays = ref.warehouseThreshold;
    final now = DateTime.now();

    final buckets = {
      _Tab.fresh: orders.where(isToPickUp).toList(),
      _Tab.almost: orders.where(isAlmostReady).toList(),
      // Muddatidan uzoq o'tganlari Omborxonaga o'tadi (⋮ menyu).
      _Tab.ready: orders.where((o) => isFullyReady(o) && !isInWarehouse(o, warehouseDays, now)).toList(),
    };

    return Scaffold(
      appBar: EmployeeAppBar(departmentLabel: 'Dastavchik', employeeName: fullName),
      body: Column(
        children: [
          const TeamJobsSection(),
          _SearchField(
            onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
          ),
          _SortChips(
            options: _sortsFor[_tab]!,
            selected: _sort[_tab]!,
            locating: _locating,
            onSelected: _selectSort,
          ),
          Expanded(
            child: _tab == _Tab.delivered
                ? _DeliveredTab(sort: _sort[_tab]!, matches: _search)
                : ordersAsync.isLoading && orders.isEmpty
                    ? const SeltaLoadingView()
                    : _OrdersList(
                        tab: _tab,
                        orders: buckets[_tab]!.where(_matches).toList(),
                        sort: _sort[_tab]!,
                        position: _position,
                        locationError: _sort[_tab] == DeliverySort.distance ? _locationError : null,
                        locating: _locating,
                      ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabs.indexWhere((t) => t.$1 == _tab),
        onDestinationSelected: (i) => setState(() => _tab = _tabs[i].$1),
        destinations: [
          for (final (tab, label, icon) in _tabs)
            NavigationDestination(
              // "Yetgazildi" — tarix, bajariladigan ish emas: unga son
              // qo'yilmaydi (aks holda u doim "e'tibor kerak" kabi ko'rinardi).
              icon: _BadgedIcon(icon: icon, count: buckets[tab]?.length ?? 0),
              label: label,
            ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  final ValueChanged<String> onChanged;
  const _SearchField({required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      child: TextField(
        onChanged: onChanged,
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
    );
  }
}

class _SortChips extends StatelessWidget {
  final List<DeliverySort> options;
  final DeliverySort selected;
  final bool locating;
  final ValueChanged<DeliverySort> onSelected;

  const _SortChips({required this.options, required this.selected, required this.locating, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final sort = options[i];
          final active = sort == selected;
          return ChoiceChip(
            label: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (sort == DeliverySort.distance && active && locating) ...[
                  const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                  const SizedBox(width: 6),
                ],
                Text(deliverySortLabels[sort]!),
              ],
            ),
            selected: active,
            showCheckmark: false,
            onSelected: (_) => onSelected(sort),
            visualDensity: VisualDensity.compact,
            selectedColor: AppColors.primary,
            backgroundColor: AppColors.surface,
            side: BorderSide(color: active ? AppColors.primary : AppColors.border),
            labelStyle: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: active ? Colors.white : AppColors.ink,
            ),
          );
        },
      ),
    );
  }
}

class _OrdersList extends StatelessWidget {
  final _Tab tab;
  final List<Order> orders;
  final DeliverySort sort;
  final LatLng? position;
  final String? locationError;
  final bool locating;

  const _OrdersList({
    required this.tab,
    required this.orders,
    required this.sort,
    required this.position,
    required this.locationError,
    required this.locating,
  });

  @override
  Widget build(BuildContext context) {
    if (sort == DeliverySort.distance && position == null) {
      return _Message(
        icon: locationError != null ? Icons.location_off_rounded : Icons.my_location_rounded,
        text: locationError ?? (locating ? 'Joylashuv aniqlanmoqda…' : "Masofa uchun joylashuv kerak"),
      );
    }

    final sorted = sortDeliveryOrders(orders, sort, from: position);
    final hiddenWithoutGps = sort == DeliverySort.distance ? orders.length - sorted.length : 0;

    if (sorted.isEmpty) {
      return _Message(
        icon: Icons.inbox_rounded,
        text: hiddenWithoutGps > 0 ? "GPS manzili saqlangan buyurtma yo'q" : "Bu bo'limda buyurtma yo'q",
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: sorted.length + (hiddenWithoutGps > 0 ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        if (i == sorted.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              "GPS manzili yo'q $hiddenWithoutGps ta buyurtma ko'rsatilmadi",
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: AppColors.gray, fontWeight: FontWeight.w600),
            ),
          );
        }
        final order = sorted[i];
        final gps = parseGps(order.gpsCoords);
        return OrderCard(
          order: order,
          onTap: () => openDeliveryOrderDetailSheet(context, order),
          onCommentTap: () => openDeliveryOrderDetailSheet(context, order, focusComments: true),
          facts: _factsFor(tab, order),
          trailing: position != null && gps != null ? formatDistance(distanceKm(position!, gps)) : null,
        );
      },
    );
  }

  static List<CardFact> _factsFor(_Tab tab, Order o) {
    switch (tab) {
      case _Tab.fresh:
        final items = o.itemStatusCounts.values.fold<int>(0, (s, v) => s + v);
        return [
          CardFact(
            Icons.schedule_rounded,
            'Qabul: ${formatDateUz(o.createdAt)}, ${formatTimeHm(o.createdAt)}${items > 0 ? ' · $items mahsulot' : ''}',
          ),
        ];
      case _Tab.almost:
        final ready = readyItems(o);
        final remaining = remainingItems(o);
        final c = o.itemStatusCounts;
        final rest = <String>[
          if ((c['pending'] ?? 0) > 0) '${c['pending']} navbatda',
          if ((c['washing'] ?? 0) > 0) '${c['washing']} yuvilmoqda',
          if ((c['returned'] ?? 0) > 0) '${c['returned']} qaytarilgan',
          if ((c['packing'] ?? 0) > 0) '${c['packing']} upakovkada',
        ];
        return [
          CardFact(Icons.check_circle_rounded, '$ready/$remaining tayyor', color: AppColors.success, strong: true),
          if (rest.isNotEmpty) CardFact(Icons.pending_rounded, rest.join(' · ')),
        ];
      case _Tab.ready:
        return [
          CardFact(Icons.payments_rounded, "Yig'ish: ${formatMoneyUz(o.totalPrice)}", color: AppColors.success, strong: true),
        ];
      case _Tab.delivered:
        return const [];
    }
  }
}

/// Bugun topshirilgan buyurtmalar.
///
/// Manba — serverdagi kunlik jurnal (aniq va faqat shu dastavchikniki),
/// ustiga hali serverga yetmagan (oflayn) topshirishlar qo'shiladi.
/// Avvalgi hisob barcha faol buyurtmalarning mahsulotlariga ALOHIDA va
/// abadiy obuna ochardi — yuzlab ulanish; bu esa bitta so'rov.
class _DeliveredTab extends ConsumerWidget {
  final DeliverySort sort;
  final String matches;

  const _DeliveredTab({required this.sort, required this.matches});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activityAsync = ref.watch(myDailyActivityProvider);
    final queue = ref.watch(actionQueueProvider);

    // Oflayn topshirilgan buyurtma serverga yetgach jurnal qayta olinadi —
    // aks holda u navbatdan chiqib, ro'yxatdan ham yo'qolib qolardi.
    ref.listen<List<PendingAction>>(actionQueueProvider, (prev, next) {
      bool justAcked(PendingAction a) =>
          a.path == '/deliverOrderItems' && a.acked && !(prev ?? const []).any((p) => p.id == a.id && p.acked);
      if (next.any(justAcked)) ref.invalidate(myDailyActivityProvider);
    });

    if (activityAsync.isLoading && !activityAsync.hasValue) return const SeltaLoadingView();

    final rows = groupDelivered(
      activityAsync.valueOrNull?.delivered ?? const [],
      queue,
      today: DateTime.now(),
    ).where((r) => matches.isEmpty || r.customerName.toLowerCase().contains(matches) || '${r.orderNumber}'.contains(matches)).toList();

    switch (sort) {
      case DeliverySort.priceHigh:
        rows.sort((a, b) => b.amount.compareTo(a.amount));
      case DeliverySort.priceLow:
        rows.sort((a, b) => a.amount.compareTo(b.amount));
      default:
        rows.sort((a, b) => (b.at ?? DateTime(0)).compareTo(a.at ?? DateTime(0)));
    }

    if (rows.isEmpty) {
      return RefreshIndicator(
        onRefresh: () => ref.refresh(myDailyActivityProvider.future),
        child: ListView(
          children: [
            const SizedBox(height: 120),
            _Message(
              icon: activityAsync.hasError ? Icons.cloud_off_rounded : Icons.inbox_rounded,
              text: activityAsync.hasError ? "Ro'yxatni yuklab bo'lmadi — tortib yangilang" : "Bugun hali topshirilgan buyurtma yo'q",
            ),
          ],
        ),
      );
    }

    final total = rows.fold<num>(0, (s, r) => s + r.amount);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(myDailyActivityProvider.future),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: rows.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          if (i == 0) {
            return Text(
              '${rows.length} ta buyurtma · ${formatMoneyUz(total)}',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.grayDark),
            );
          }
          final row = rows[i - 1];
          final order = _orderFor(ref, row);
          return OrderCard(
            order: order,
            onTap: () => _open(context, ref, row.orderId, order),
            facts: [
              CardFact(
                Icons.check_circle_rounded,
                '${row.itemCount} ta mahsulot · ${formatMoneyUz(row.amount)}'
                '${row.at != null ? ' · ${formatTimeHm(row.at!)}' : ''}',
                color: AppColors.success,
                strong: true,
              ),
            ],
          );
        },
      ),
    );
  }

  /// Keshdagi to'liq buyurtma; yo'q bo'lsa (ancha eski, yakunlangan)
  /// jurnaldagi ma'lumotdan qisqa nusxa — kartani chizish uchun yetarli.
  static Order _orderFor(WidgetRef ref, DeliveredRow row) {
    for (final o in ref.read(ordersProvider).valueOrNull ?? const <Order>[]) {
      if (o.id == row.orderId) return row.pending ? o.copyWith(pendingSync: true) : o;
    }
    return Order(
      id: row.orderId,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      phone: '',
      location: '',
      serviceType: 'pickup',
      status: 'done',
      createdBy: '',
      createdAt: row.at ?? DateTime.now(),
      pendingSync: row.pending,
    );
  }

  /// To'liq ma'lumot bilan ochadi — qisqa nusxa bo'lsa hujjat o'qiladi
  /// (avval qurilma keshidan, bo'lmasa serverdan).
  static Future<void> _open(BuildContext context, WidgetRef ref, String orderId, Order fallback) async {
    var order = fallback;
    if (fallback.phone.isEmpty) {
      // Internetsiz va keshda yo'q bo'lsa — qisqa nusxa bilan ochiladi.
      final doc = await getDocFast(FirebaseFirestore.instance.collection('orders').doc(orderId));
      if (doc != null && doc.exists) order = Order.fromFirestore(doc);
    }
    if (context.mounted) openDeliveryOrderDetailSheet(context, order);
  }
}

/// Bitta topshirilgan buyurtma (bugungi).
class DeliveredRow {
  final String orderId;
  final int orderNumber;
  final String customerName;
  int itemCount;
  num amount;
  DateTime? at;

  /// Hali serverga yetmagan (oflayn) topshirish.
  bool pending;

  DeliveredRow({
    required this.orderId,
    required this.orderNumber,
    required this.customerName,
    this.itemCount = 0,
    this.amount = 0,
    this.at,
    this.pending = false,
  });
}

/// Jurnal yozuvlari (mahsulot bo'yicha) + navbatdagi topshirishlar ->
/// buyurtma bo'yicha guruhlangan ro'yxat.
///
/// Navbatdagi amal serverga yetib, jurnalda paydo bo'lgach ham u bir
/// necha soniya navbatda turadi — shu oraliqda ikki marta sanalmasligi
/// uchun jurnalda bor mahsulotlar navbatdan olinmaydi.
List<DeliveredRow> groupDelivered(List<StageEntry> logged, List<PendingAction> queue, {required DateTime today}) {
  final byOrder = <String, DeliveredRow>{};
  final loggedItems = <String>{};

  for (final e in logged) {
    if (e.itemId != null) loggedItems.add(e.itemId!);
    final row = byOrder.putIfAbsent(
      e.orderId,
      () => DeliveredRow(orderId: e.orderId, orderNumber: e.orderNumber, customerName: e.customerName),
    );
    row.itemCount++;
    row.amount += e.price;
    if (e.at != null && (row.at == null || e.at!.isAfter(row.at!))) row.at = e.at;
  }

  for (final a in queue) {
    if (a.path != '/deliverOrderItems' || a.failed || a.orderId == null) continue;
    final sameDay = a.createdAt.year == today.year && a.createdAt.month == today.month && a.createdAt.day == today.day;
    if (!sameDay) continue;
    final itemIds = (a.body['itemIds'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    final fresh = itemIds.where((id) => !loggedItems.contains(id)).length;
    if (fresh == 0) continue;

    // Raqam va ism bu yerda yo'q: oflayn topshirilgan buyurtma doim
    // qurilma keshida (xodim uni ochib topshirgan), karta ularni o'sha
    // yerdan oladi.
    final row = byOrder.putIfAbsent(
      a.orderId!,
      () => DeliveredRow(orderId: a.orderId!, orderNumber: 0, customerName: ''),
    );
    row.itemCount += fresh;
    row.amount += (a.body['paidAmount'] as num?) ?? 0;
    row.pending = true;
    if (row.at == null || a.createdAt.isAfter(row.at!)) row.at = a.createdAt;
  }
  return byOrder.values.toList();
}

class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Message({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 36, color: AppColors.gray),
            const SizedBox(height: 10),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.gray, fontWeight: FontWeight.w600),
            ),
          ],
        ),
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

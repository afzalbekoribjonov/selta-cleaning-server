import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/order_items_provider.dart' show effectiveDueDate;
import '../../core/services/orders_repository.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/widgets/filter_pill.dart';
import '../../core/widgets/selta_loader.dart';
import '../delivery/driver_tasks.dart' show isAssignmentOpen;
import '../dispatcher/widgets/order_card.dart';
import 'supervisor_order_sheet.dart';
import 'supervisor_widgets.dart' show dayLabelUz;
import 'supervisor_workflow.dart' show orderMatchesQuery;

enum _Filter { active, pickup, inShop, onsite, overdue, done }

/// "Buyurtmalar" — barcha buyurtmalar bitta joyda.
///
/// Faol buyurtmalar ilovadagi umumiy oqimdan (qo'shimcha o'qish yo'q) va
/// ekranga 20 tadan chiziladi. Yakunlanganlari faqat shu bo'lim ochilganda
/// Firestore'dan 20 tadan sahifalab o'qiladi — hammasi birdaniga emas.
class SupervisorOrdersTab extends ConsumerStatefulWidget {
  const SupervisorOrdersTab({super.key});

  @override
  ConsumerState<SupervisorOrdersTab> createState() => _SupervisorOrdersTabState();
}

class _SupervisorOrdersTabState extends ConsumerState<SupervisorOrdersTab> {
  static const _pageSize = 20;

  final _scroll = ScrollController();
  _Filter _filter = _Filter.active;
  String _search = '';
  int _shown = _pageSize;

  // Yakunlanganlar sahifalari.
  final List<Order> _done = [];
  DocumentSnapshot<Map<String, dynamic>>? _cursor;
  bool _doneLoading = false;
  bool _doneEnd = false;
  String? _doneError;

  // Bazadan qidiruv (raqam yoki to'liq telefon).
  List<Order>? _remote;
  bool _remoteLoading = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients || _scroll.position.extentAfter > 600) return;
    if (_filter == _Filter.done) {
      _loadMoreDone();
    }
  }

  void _setFilter(_Filter f) {
    setState(() {
      _filter = f;
      _shown = _pageSize;
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
    if (f == _Filter.done && _done.isEmpty) _loadMoreDone();
  }

  Future<void> _loadMoreDone() async {
    if (_doneLoading || _doneEnd) return;
    setState(() {
      _doneLoading = true;
      _doneError = null;
    });
    try {
      final page = await ref.read(ordersRepositoryProvider).fetchDoneOrdersPage(after: _cursor, limit: _pageSize);
      if (!mounted) return;
      setState(() {
        final known = _done.map((o) => o.id).toSet();
        _done.addAll(page.orders.where((o) => !known.contains(o.id)));
        _cursor = page.last ?? _cursor;
        // Keshdan kelgan qisqa javob "oxiri" degani emas — internet yo'q.
        if (page.orders.length < _pageSize) {
          if (page.fromCache) {
            _doneError = "Internet yo'q — qolganlarini yuklab bo'lmadi";
          } else {
            _doneEnd = true;
          }
        }
        _doneLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _doneLoading = false;
        _doneError = "Yuklab bo'lmadi";
      });
    }
  }

  Future<void> _refreshDone() async {
    setState(() {
      _done.clear();
      _cursor = null;
      _doneEnd = false;
      _doneError = null;
    });
    await _loadMoreDone();
  }

  Future<void> _searchRemote() async {
    final term = _search;
    if (term.isEmpty) return;
    setState(() => _remoteLoading = true);
    try {
      final found = await ref.read(ordersRepositoryProvider).searchOrders(term);
      if (mounted && term == _search) setState(() => _remote = found);
    } finally {
      if (mounted) setState(() => _remoteLoading = false);
    }
  }

  static bool _matches(_Filter f, Order o, DateTime now) => switch (f) {
        _Filter.active => !o.isDone,
        _Filter.pickup => !o.isDone && o.serviceType == 'pickup' && (o.status == 'new' || o.status == 'picked_up'),
        _Filter.inShop => !o.isDone && o.serviceType == 'pickup' && o.status == 'brought_in',
        _Filter.onsite => !o.isDone && o.serviceType == 'onsite',
        _Filter.overdue => !o.isDone && (effectiveDueDate(o)?.isBefore(now) ?? false),
        _Filter.done => o.isDone,
      };

  /// Raqam yoki to'liq telefon — bazadan ham qidirsa bo'ladi.
  bool get _searchable {
    final n = _search.replaceFirst('#', '');
    if (RegExp(r'^\d+$').hasMatch(n) && n.length < 9) return true;
    return _search.replaceAll(RegExp(r'\D'), '').length >= 9;
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final ordersAsync = ref.watch(ordersProvider);
    final live = ordersAsync.valueOrNull ?? const <Order>[];

    final List<Order> source;
    if (_filter == _Filter.done) {
      // Ilovadagi oxirgi buyurtmalar ichidagi yakunlanganlar ham (yangi
      // yakunlangani darhol ko'rinadi), takrorlanmasdan.
      final byId = <String, Order>{for (final o in _done) o.id: o};
      for (final o in live) {
        if (o.isDone) byId[o.id] = o;
      }
      source = byId.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    } else {
      source = live.where((o) => _matches(_filter, o, now)).toList();
    }

    final remote = _remote;
    final List<Order> all;
    if (remote != null && _search.isNotEmpty) {
      final byId = <String, Order>{for (final o in source.where((o) => orderMatchesQuery(o, _search))) o.id: o};
      for (final o in remote) {
        byId.putIfAbsent(o.id, () => o);
      }
      all = byId.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    } else {
      all = source.where((o) => orderMatchesQuery(o, _search)).toList();
    }

    final isDone = _filter == _Filter.done;
    final visible = isDone ? all : all.take(_shown).toList();
    final hasMoreLocal = !isDone && all.length > visible.length;

    int countOf(_Filter f) => live.where((o) => _matches(f, o, now)).length;

    final today = dateKeyOf(now);

    return Column(
      children: [
        FilterPillBar(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          children: [
            for (final f in _Filter.values)
              FilterPill(
                label: switch (f) {
                  _Filter.active => 'Faol',
                  _Filter.pickup => 'Olib kelish',
                  _Filter.inShop => 'Sexda',
                  _Filter.onsite => 'Joyida',
                  _Filter.overdue => "Muddati o'tgan",
                  _Filter.done => 'Yakunlangan',
                },
                count: f == _Filter.done ? null : countOf(f),
                color: f == _Filter.overdue ? AppColors.danger : AppColors.primary,
                selected: _filter == f,
                onTap: () => _setFilter(f),
              ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
          child: TextField(
            onChanged: (v) => setState(() {
              _search = v.trim().toLowerCase();
              _shown = _pageSize;
              _remote = null;
            }),
            onSubmitted: (_) {
              if (_searchable) _searchRemote();
            },
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              hintText: 'Mijoz, #raqam, telefon yoki manzil',
              prefixIcon: Icon(Icons.search_rounded, size: 20),
              isDense: true,
            ),
          ),
        ),
        if (_searchable && _remote == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _remoteLoading ? null : _searchRemote,
                icon: _remoteLoading
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.cloud_sync_rounded, size: 18),
                label: const Text('Barcha buyurtmalardan qidirish', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            // Faol buyurtmalar jonli oqimda — yangilash shart emas.
            onRefresh: isDone ? _refreshDone : () async {},
            child: ordersAsync.isLoading && live.isEmpty && !isDone
                ? const SeltaLoadingView()
                : visible.isEmpty && !(isDone && _doneLoading)
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 60),
                            child: Column(
                              children: [
                                const Icon(Icons.inbox_rounded, size: 40, color: AppColors.gray),
                                const SizedBox(height: 8),
                                Text(
                                  _search.isNotEmpty ? 'Topilmadi' : (isDone && _doneError != null ? _doneError! : "Buyurtma yo'q"),
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600),
                                ),
                                if (isDone && _doneError != null && _search.isEmpty) ...[
                                  const SizedBox(height: 10),
                                  OutlinedButton(onPressed: _refreshDone, child: const Text('Qayta urinish')),
                                ],
                              ],
                            ),
                          ),
                        ],
                      )
                    : ListView.separated(
                        controller: _scroll,
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
                        itemCount: visible.length + 1,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          if (i == visible.length) {
                            return _ListFooter(
                              loading: isDone && _doneLoading,
                              error: isDone ? _doneError : null,
                              moreLocal: hasMoreLocal ? all.length - visible.length : 0,
                              canLoadMore: isDone && !_doneEnd && _search.isEmpty,
                              onMore: () => isDone ? _loadMoreDone() : setState(() => _shown += _pageSize),
                            );
                          }
                          final o = visible[i];
                          return OrderCard(
                            order: o,
                            facts: _factsOf(o, today),
                            onTap: () => openSupervisorOrderSheet(context, o),
                            onCommentTap: () => openSupervisorOrderSheet(context, o, focusComments: true),
                          );
                        },
                      ),
          ),
        ),
      ],
    );
  }

  List<CardFact> _factsOf(Order o, String today) {
    final a = o.assignment;
    return [
      if (o.serviceType == 'pickup' && o.status == 'brought_in') CardFact.stages(o) else CardFact.price(o),
      if (a != null && isAssignmentOpen(o))
        CardFact(
          Icons.local_shipping_rounded,
          '${a.driverName} · ${a.date == today ? 'bugun' : dayLabelUz(DateTime.parse(a.date)).toLowerCase()} · '
          '${a.isPickup ? 'olib keladi' : 'yetkazadi'}',
          color: AppColors.primary,
        ),
    ];
  }
}

class _ListFooter extends StatelessWidget {
  final bool loading;
  final String? error;
  final int moreLocal;
  final bool canLoadMore;
  final VoidCallback onMore;

  const _ListFooter({
    required this.loading,
    required this.error,
    required this.moreLocal,
    required this.canLoadMore,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: SeltaLoader(size: 28)));
    }
    if (moreLocal > 0 || canLoadMore || error != null) {
      return Center(
        child: Column(
          children: [
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ),
            OutlinedButton(
              onPressed: onMore,
              child: Text(moreLocal > 0 ? "Yana ko'rsatish ($moreLocal ta qoldi)" : (error != null ? 'Qayta urinish' : "Yana yuklash")),
            ),
          ],
        ),
      );
    }
    return const SizedBox(height: 8);
  }
}

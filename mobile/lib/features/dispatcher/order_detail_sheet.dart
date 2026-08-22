import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../shared/comments_section.dart';
import '../shared/item_detail_row.dart';
import '../shared/sales_manager_notes_card.dart';
import '../shared/team_assign_sheet.dart';

void openOrderDetailSheet(BuildContext context, Order order) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _OrderDetailSheet(order: order),
  );
}

final _itemsProvider = StreamProvider.family<List<OrderItem>, String>((ref, orderId) {
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchItems(orderId);
});

class _OrderDetailSheet extends ConsumerWidget {
  final Order order;
  const _OrderDetailSheet({required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Ochilganda berilgan `order` faqat boshlang'ich hujjat — masalan
    // "Jamoa biriktirish" shu varaq ustida ochilgan pastki varaqda amalga
    // oshirilsa, u yopilgach shu yerdagi holat yangilanmay ("Jamoa
    // biriktirish" tugmasi hamon ko'rinib) qolar edi. Endi joriy ro'yxatdan
    // jonli holatni kuzatib boramiz — topilmasa (masalan sahifalanган eski
    // buyurtma) boshlang'ich qiymatga qaytadi.
    final recentOrders = ref.watch(recentOrdersProvider).value;
    Order? matched;
    if (recentOrders != null) {
      for (final o in recentOrders) {
        if (o.id == order.id) {
          matched = o;
          break;
        }
      }
    }
    final liveOrder = matched ?? order;
    final itemsAsync = ref.watch(_itemsProvider(liveOrder.id));

    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.bg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  // Talab: klaviatura chiqqanda eng pastdagi inputlar
                  // yopilib qolmasligi kerak.
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 32 + MediaQuery.of(context).viewInsets.bottom),
                  children: [
                    _Header(order: liveOrder),
                    const SizedBox(height: 20),
                    _InfoCard(order: liveOrder),
                    if (liveOrder.notedItems.isNotEmpty || liveOrder.estimatedPrice != null) ...[
                      const SizedBox(height: 14),
                      SalesManagerNotesCard(order: liveOrder),
                    ],
                    if (liveOrder.serviceType == 'onsite' && liveOrder.status == 'new') ...[
                      const SizedBox(height: 14),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => openTeamAssignSheet(context, liveOrder.id),
                          icon: const Icon(Icons.groups_rounded),
                          label: const Text('Jamoa biriktirish'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(color: AppColors.primary),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    itemsAsync.when(
                      loading: () => const Padding(padding: EdgeInsets.all(6), child: LinearProgressIndicator()),
                      error: (e, _) => Text('Xatolik: $e', style: const TextStyle(color: AppColors.danger)),
                      data: (items) => _ItemsSummaryCard(order: liveOrder, items: items),
                    ),
                    const SizedBox(height: 20),
                    _ProgressChecklist(order: liveOrder),
                    const SizedBox(height: 20),
                    CommentsSection(orderId: liveOrder.id),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  final Order order;
  const _Header({required this.order});

  @override
  Widget build(BuildContext context) {
    final status = statusOf(order.status);
    // Pickup buyurtmalarda tarif endi item-darajasida — order.tariff faqat
    // onsite uchun mavjud.
    final tariff = order.tariff != null ? tariffOf(order.tariff) : null;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Buyurtma #${order.orderNumber}', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 6),
              Row(
                children: [
                  _pill(status.label, status.color, status.background),
                  if (tariff != null) ...[
                    const SizedBox(width: 8),
                    _pill(tariff.label, tariff.color, tariff.background),
                  ],
                ],
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: () => showDialog(context: context, builder: (_) => _EditOrderDialog(order: order)),
          icon: const Icon(Icons.edit_rounded),
          style: IconButton.styleFrom(backgroundColor: AppColors.surface, foregroundColor: AppColors.primary),
        ),
      ],
    );
  }

  Widget _pill(String label, Color color, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
      );
}

class _InfoCard extends StatelessWidget {
  final Order order;
  const _InfoCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _row(Icons.person_rounded, order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName),
          _row(Icons.phone_rounded, order.phone),
          _row(Icons.location_on_rounded, order.location),
          _row(
            order.serviceType == 'onsite' ? Icons.home_repair_service_rounded : Icons.local_shipping_rounded,
            order.serviceType == 'onsite' ? 'Joyida yuvish' : 'Olib kelish',
          ),
          if (order.dueDate != null)
            _row(
              Icons.event_rounded,
              'Muddat: ${formatDateUz(order.dueDate!)}',
              color: order.isOverdue ? AppColors.danger : null,
            ),
          _row(Icons.access_time_rounded, 'Qabul qilindi: ${formatDateTimeUz(order.createdAt)}'),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String text, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: color ?? AppColors.gray),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, color: color ?? AppColors.ink, fontWeight: color != null ? FontWeight.w700 : FontWeight.w500))),
          ],
        ),
      );
}

/// Dispetcher mahsulotlarni o'zi qo'shmaydi/tahrirlamaydi, lekin nazorat
/// uchun nima qo'shilgani — o'lchovi, holati, narxi — ko'rinishi kerak.
class _ItemsSummaryCard extends StatelessWidget {
  final Order order;
  final List<OrderItem> items;
  const _ItemsSummaryCard({required this.order, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Mahsulotlar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const Spacer(),
              if (items.isNotEmpty) Text('${order.totalPrice.toStringAsFixed(0)} so\'m', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.primary)),
            ],
          ),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Hali mahsulot belgilanmagan', style: TextStyle(color: AppColors.gray, fontSize: 13)),
            )
          else
            for (final item in items) ItemDetailRow(item: item, subId: item.subId(order.orderNumber)),
        ],
      ),
    );
  }
}

/// Progress checklist — talab: "Dispetcher buyurtmani tekshirishda buyurtma
/// holati bo'yicha bajarilgan va qolgan qismlari ko'rsatilishi kerak".
/// Faqat ko'rish uchun — status o'zgartirish dispetcherga tegishli emas
/// (bu ishchi/dastavchik/QC vazifasi).
class _ProgressChecklist extends StatelessWidget {
  final Order order;
  const _ProgressChecklist({required this.order});

  @override
  Widget build(BuildContext context) {
    final pipeline = kServicePipeline[order.serviceType] ?? kServicePipeline['pickup']!;
    final currentIndex = pipeline.indexOf(order.status);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Jarayon', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 12),
          for (var i = 0; i < pipeline.length; i++) _step(pipeline[i], i, currentIndex, isLast: i == pipeline.length - 1),
        ],
      ),
    );
  }

  Widget _step(String status, int index, int currentIndex, {required bool isLast}) {
    final info = statusOf(status);
    final done = index < currentIndex;
    final current = index == currentIndex;
    final color = done || current ? info.color : AppColors.gray;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? color : (current ? Colors.white : AppColors.bg),
                  border: Border.all(color: color, width: 2),
                ),
                child: done
                    ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                    : (current ? Center(child: Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle))) : null),
              ),
              if (!isLast) Expanded(child: Container(width: 2, color: done ? color : AppColors.border)),
            ],
          ),
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              info.label,
              style: TextStyle(
                fontWeight: current ? FontWeight.w800 : FontWeight.w600,
                fontSize: 13.5,
                color: done || current ? AppColors.ink : AppColors.gray,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EditOrderDialog extends ConsumerStatefulWidget {
  final Order order;
  const _EditOrderDialog({required this.order});

  @override
  ConsumerState<_EditOrderDialog> createState() => _EditOrderDialogState();
}

class _EditOrderDialogState extends ConsumerState<_EditOrderDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _locationController;
  String? _tariff;
  bool _saving = false;
  String? _error;

  bool get _isOnsite => widget.order.serviceType == 'onsite';

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.order.customerName);
    _phoneController = TextEditingController(text: widget.order.phone.replaceFirst('+998', ''));
    _locationController = TextEditingController(text: widget.order.location);
    _tariff = widget.order.tariff;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final digits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
      await ref.read(ordersRepositoryProvider).updateOrder(
            orderId: widget.order.id,
            customerName: _nameController.text.trim(),
            phone: '+998$digits',
            location: _locationController.text.trim(),
            tariff: _isOnsite ? _tariff : null,
          );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = describeApiError(e);
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Buyurtmani tahrirlash'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Ism familiya')),
            const SizedBox(height: 12),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
              decoration: const InputDecoration(labelText: 'Telefon', prefixText: '+998 '),
            ),
            const SizedBox(height: 12),
            TextField(controller: _locationController, maxLines: 2, decoration: const InputDecoration(labelText: "Mo'ljal")),
            if (_isOnsite) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entry in kTariffConfig.entries)
                    ChoiceChip(
                      label: Text(entry.value.label),
                      selected: _tariff == entry.key,
                      onSelected: (_) => setState(() => _tariff = entry.key),
                      selectedColor: entry.value.color,
                      labelStyle: TextStyle(color: _tariff == entry.key ? Colors.white : AppColors.ink, fontWeight: FontWeight.w700),
                    ),
                ],
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('Bekor qilish')),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Saqlash'),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/order_items_provider.dart';
import '../../core/services/orders_repository.dart';
import '../../core/services/catalog_repository.dart' show orderSourcesProvider;
import '../../core/utils/date_utils.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import '../shared/catalog_item_sheet.dart';
import '../shared/comments_section.dart';
import '../shared/item_detail_row.dart';
import '../shared/order_copy.dart';
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
    final recentOrders = ref.watch(ordersProvider).value;
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
    final itemsAsync = ref.watch(orderItemsProvider(liveOrder.id));

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
                    _Header(order: liveOrder, items: itemsAsync.valueOrNull),
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

  /// Nusxa olish uchun — hali yuklanmagan bo'lsa tugma o'chiq turadi.
  final List<OrderItem>? items;

  const _Header({required this.order, required this.items});

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
              Text('Buyurtma ${order.displayNumber}', style: Theme.of(context).textTheme.headlineSmall),
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
        CopyOrderButton(order: order, items: items),
        const SizedBox(width: 6),
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

/// Buyurtma mahsulotlari — o'lchovi, holati, narxi.
///
/// Olib kelish buyurtmasi hali "Yangi" bo'lsa (dastavchik olib ketmagan)
/// sotuv menejeri mahsulot qo'sha, tahrirlay va o'chira oladi — mijoz
/// telefonda nimanidir o'zgartirsa. Olib ketilgandan keyin mahsulotlar
/// sexda va faqat ko'rish uchun.
class _ItemsSummaryCard extends StatelessWidget {
  final Order order;
  final List<OrderItem> items;
  const _ItemsSummaryCard({required this.order, required this.items});

  bool get editable => order.serviceType == 'pickup' && order.status == 'new';

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
              const Expanded(child: Text('Mahsulotlar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
              if (items.isNotEmpty)
                Text(formatMoneyUz(order.totalPrice), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.primary)),
              if (editable) ...[
                const SizedBox(width: 4),
                TextButton.icon(
                  onPressed: () => openCatalogItemSheet(context, order),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text("Qo'shish"),
                ),
              ],
            ],
          ),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Hali mahsulot belgilanmagan', style: TextStyle(color: AppColors.gray, fontSize: 13)),
            )
          else
            for (final item in items)
              ItemDetailRow(
                item: item,
                subId: item.subId(order.orderNumber),
                onTap: editable ? () => openCatalogItemSheet(context, order, existingItem: item) : null,
              ),
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

/// Buyurtmani tahrirlash.
///
/// "Yangi" holatda (hali olib ketilmagan / jamoa biriktirilmagan) hammasi
/// tahrirlanadi: mijoz, manba, joyida yuvishda mijoz aytgan mahsulotlar va
/// taxminiy summa (mahsulotlarning o'zi — oynadagi "Mahsulotlar" qismida).
/// Ishga kirishilgach faqat aloqa ma'lumotlari: qolganlari endi tarixiy
/// ma'lumot va hisob-kitoblarga kirgan.
class _EditOrderDialogState extends ConsumerState<_EditOrderDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _locationController;
  late final TextEditingController _notedItemsController;
  late final TextEditingController _estimateController;
  String? _tariff;
  String? _source;
  bool _saving = false;
  String? _error;

  bool get _isOnsite => widget.order.serviceType == 'onsite';
  bool get _isNew => widget.order.status == 'new';

  @override
  void initState() {
    super.initState();
    final o = widget.order;
    _nameController = TextEditingController(text: o.customerName);
    final digits = o.phone.replaceAll(RegExp(r'\D'), '');
    _phoneController = TextEditingController(
      text: UzPhoneFormatter()
          .formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: digits.length > 9 ? digits.substring(digits.length - 9) : digits))
          .text,
    );
    _locationController = TextEditingController(text: o.location);
    _notedItemsController = TextEditingController(text: o.notedItems.join(', '));
    _estimateController = TextEditingController(text: o.estimatedPrice?.round().toString() ?? '');
    _tariff = o.tariff;
    _source = o.source;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    _notedItemsController.dispose();
    _estimateController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final digits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
    if (_nameController.text.trim().isEmpty || _locationController.text.trim().isEmpty || digits.length != 9) {
      setState(() => _error = "Ism, 9 xonali telefon va manzil majburiy");
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).updateOrder(
            orderId: widget.order.id,
            customerName: _nameController.text.trim(),
            phone: '+998$digits',
            location: _locationController.text.trim(),
            tariff: _isOnsite ? _tariff : null,
            newOrderFields: _isNew
                ? (
                    source: _source,
                    notedItems: _isOnsite
                        ? _notedItemsController.text.split(',').map((x) => x.trim()).where((x) => x.isNotEmpty).toList()
                        : null,
                    estimatedPrice: _isOnsite ? num.tryParse(_estimateController.text.replaceAll(' ', '')) : null,
                  )
                : null,
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
      scrollable: true,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!_isNew) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(10)),
              child: const Text(
                "Buyurtma ishga olingan — faqat mijoz aloqa ma'lumotlari tahrirlanadi.",
                style: TextStyle(fontSize: 12.5, color: AppColors.grayDark, height: 1.35),
              ),
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Ism familiya'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            inputFormatters: [UzPhoneFormatter()],
            decoration: const InputDecoration(labelText: 'Telefon', prefixText: '+998 '),
          ),
          const SizedBox(height: 12),
          TextField(controller: _locationController, maxLines: 2, decoration: const InputDecoration(labelText: 'Manzil')),
          if (_isNew)
            ref.watch(orderSourcesProvider).maybeWhen(
                  data: (sources) => sources.isEmpty
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Manba', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.grayDark)),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  for (final src in sources)
                                    ChoiceChip(
                                      label: Text(src.name),
                                      selected: _source == src.id,
                                      onSelected: (v) => setState(() => _source = v ? src.id : null),
                                      selectedColor: colorFromHex(src.color),
                                      labelStyle: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12.5,
                                        color: _source == src.id ? Colors.white : AppColors.ink,
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                  orElse: () => const SizedBox.shrink(),
                ),
          if (_isOnsite) ...[
            const SizedBox(height: 16),
            const Text('Tarif', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.grayDark)),
            const SizedBox(height: 8),
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
            if (_isNew) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _notedItemsController,
                decoration: const InputDecoration(
                  labelText: 'Mijoz aytgan mahsulotlar',
                  helperText: 'Vergul bilan: gilam, parda, divan',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _estimateController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Taxminiy summa', suffixText: "so'm"),
              ),
            ],
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('Bekor qilish')),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Saqlash'),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/models/product.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/catalog_repository.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';

const _calcTypeIcons = {
  'sqm': Icons.crop_square_rounded,
  'meter': Icons.straighten_rounded,
  'kg': Icons.scale_rounded,
  'count': Icons.tag_rounded,
  'size': Icons.checkroom_rounded,
};
const _calcTypeLabels = {
  'sqm': 'm²',
  'meter': 'metr',
  'kg': 'kg',
  'count': 'soni',
  'size': 'kichik/katta',
};

const _conditions = [
  (null, 'Yaxshi'),
  ('average', "O'rtacha"),
  ('bad', 'Yomon'),
  ('veryBad', 'Juda yomon'),
];

/// Katalogdan mahsulot tanlab (yoki qo'lda kiritib) buyurtmaga qo'shish
/// — `existingItem` berilsa tahrirlash rejimida ochiladi (o'chirish
/// tugmasi bilan). Dastavchik ("Olib ketildi"dan oldin, ixtiyoriy) va
/// ishchi ("Sexga keldi"da) shu bitta komponentni ishlatadi. Faqat
/// buyurtma tarifiga mos mahsulotlar ko'rsatiladi.
Future<void> openCatalogItemSheet(BuildContext context, Order order, {OrderItem? existingItem}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _CatalogItemSheet(
      serviceType: order.serviceType,
      orderTariff: order.tariff,
      orderId: order.id,
      existingItem: existingItem,
    ),
  );
}

/// Sotuv menejerining "Yangi buyurtma" formasida — buyurtma hali
/// yaratilmagan bo'lsa ham mahsulot qo'shish (talab #3: itemlar inline,
/// har biri o'z tarifi bilan) — server chaqirilmaydi, `onAdd` orqali
/// mahalliy ro'yxatga qo'shiladi, buyurtma "Tasdiqlash"da bir yo'la
/// yaratiladi.
Future<void> openDraftItemSheet(BuildContext context, {required void Function(CatalogItemDraft draft) onAdd}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _CatalogItemSheet(serviceType: 'pickup', onLocalAdd: onAdd),
  );
}

class _CatalogItemSheet extends ConsumerStatefulWidget {
  final String serviceType;
  final String? orderTariff;
  final String? orderId;
  final OrderItem? existingItem;
  final void Function(CatalogItemDraft draft)? onLocalAdd;

  const _CatalogItemSheet({
    required this.serviceType,
    this.orderTariff,
    this.orderId,
    this.existingItem,
    this.onLocalAdd,
  });

  @override
  ConsumerState<_CatalogItemSheet> createState() => _CatalogItemSheetState();
}

class _CatalogItemSheetState extends ConsumerState<_CatalogItemSheet> {
  Product? _product;
  bool _customMode = false;
  final _nameController = TextEditingController();
  final _customPriceController = TextEditingController();
  final _widthController = TextEditingController();
  final _heightController = TextEditingController();
  final _directAreaController = TextEditingController();
  bool _sqmDirectMode = false;
  num _qty = 1;
  String? _sizeVariant = 'small';
  String? _condition;
  late String _tariff;
  bool _saving = false;
  bool _deleting = false;
  String? _error;

  bool get _editing => widget.existingItem != null;
  // Onsite buyurtmalarda tarif order-level (o'zgarmagan) — faqat pickup
  // itemlari o'z tarifini alohida tanlaydi (talab: har bir item o'z
  // tarifiga ega).
  bool get _showTariffPicker => widget.serviceType == 'pickup';

  @override
  void initState() {
    super.initState();
    final item = widget.existingItem;
    _tariff = item?.tariff ?? widget.orderTariff ?? 'standart';
    if (item != null) {
      _nameController.text = item.name;
      _condition = item.condition;
      _customMode = item.calcType == 'fixed';
      if (_customMode) {
        _customPriceController.text = item.price.toString();
      } else {
        _qty = item.qty ?? 1;
        _sizeVariant = item.sizeVariant ?? 'small';
        if (item.calcType == 'sqm' && item.width != null && item.height != null) {
          _widthController.text = item.width.toString();
          _heightController.text = item.height.toString();
        } else if (item.calcType == 'sqm') {
          _sqmDirectMode = true;
          _directAreaController.text = item.qty?.toString() ?? '';
        }
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _customPriceController.dispose();
    _widthController.dispose();
    _heightController.dispose();
    _directAreaController.dispose();
    super.dispose();
  }

  num get _measuredQty {
    if (_product?.calcType == 'sqm') {
      if (_sqmDirectMode) return num.tryParse(_directAreaController.text.replaceAll(',', '.')) ?? 0;
      final w = num.tryParse(_widthController.text.replaceAll(',', '.')) ?? 0;
      final h = num.tryParse(_heightController.text.replaceAll(',', '.')) ?? 0;
      return (w * h * 100).round() / 100;
    }
    return _qty;
  }

  num get _estimatedPrice {
    if (_customMode || _product == null) {
      return num.tryParse(_customPriceController.text.replaceAll(',', '.')) ?? 0;
    }
    num base;
    final tariffPrice = _product!.priceFor(_tariff);
    if (_product!.calcType == 'size') {
      base = (_sizeVariant == 'large' ? tariffPrice.largePrice : tariffPrice.smallPrice) ?? 0;
    } else {
      base = (tariffPrice.unitPrice ?? 0) * _measuredQty;
    }
    final surcharges = ref.read(conditionSurchargesProvider).valueOrNull ?? const ConditionSurcharges();
    final percent = surcharges.percentFor(_condition);
    return (base * (1 + percent / 100)).round();
  }

  CatalogItemDraft _buildDraft() {
    final name = _nameController.text.trim().isEmpty ? (_product?.name ?? 'Mahsulot') : _nameController.text.trim();
    if (_customMode || _product == null) {
      return CatalogItemDraft(
        name: name,
        calcType: 'fixed',
        tariff: _tariff,
        price: num.tryParse(_customPriceController.text.replaceAll(',', '.')) ?? 0,
      );
    }
    return CatalogItemDraft(
      name: name,
      productId: _product!.id,
      calcType: _product!.calcType,
      tariff: _tariff,
      width: _product!.calcType == 'sqm' && !_sqmDirectMode ? num.tryParse(_widthController.text.replaceAll(',', '.')) : null,
      height: _product!.calcType == 'sqm' && !_sqmDirectMode ? num.tryParse(_heightController.text.replaceAll(',', '.')) : null,
      qty: _product!.calcType == 'size' ? null : _measuredQty,
      sizeVariant: _product!.calcType == 'size' ? _sizeVariant : null,
      condition: _condition,
    );
  }

  Future<void> _save() async {
    final draft = _buildDraft();
    if (widget.orderId == null) {
      widget.onLocalAdd!(draft);
      if (mounted) Navigator.of(context).pop();
      return;
    }
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      if (_editing) {
        await ref.read(ordersRepositoryProvider).updateOrderItem(
              orderId: widget.orderId!,
              itemId: widget.existingItem!.id,
              item: draft,
            );
      } else {
        await ref.read(ordersRepositoryProvider).addOrderItems(orderId: widget.orderId!, items: [draft]);
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Mahsulotni o'chirish"),
        content: const Text("Bu mahsulotni buyurtmadan o'chirmoqchimisiz?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text("O'chirish")),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deleting = true);
    try {
      await ref.read(ordersRepositoryProvider).deleteOrderItem(orderId: widget.orderId!, itemId: widget.existingItem!.id);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = describeApiError(e);
        _deleting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(productsProvider);
    final surchargesAsync = ref.watch(conditionSurchargesProvider);
    final currentEmployee = ref.watch(currentEmployeeProvider).valueOrNull;
    // Faqat "worker" bo'limidagi xodim uchun mutaxassislik bo'yicha
    // filtrlanadi (dastavchik va boshqalar cheklanmaydi).
    final specializations = currentEmployee?['department'] == 'worker'
        ? ((currentEmployee?['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[])
        : const <String>[];

    // Tahrirlash rejimida mahsulot ro'yxati kelgach, item'ning
    // productId'siga mos mahsulotni bir marta avtomatik tanlaydi.
    final existingProductId = widget.existingItem?.productId;
    if (!_customMode && _product == null && existingProductId != null && productsAsync.hasValue) {
      final matches = productsAsync.value!.where((p) => p.id == existingProductId);
      if (matches.isNotEmpty) {
        final match = matches.first;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _product = match);
        });
      }
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  // Talab: klaviatura chiqqanda eng pastdagi inputlar
                  // (narx, saqlash tugmasi) yopilib qolmasligi kerak —
                  // pastki bo'shliq klaviatura balandligiga qarab oshadi.
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 32 + MediaQuery.of(context).viewInsets.bottom),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(_editing ? 'Mahsulotni tahrirlash' : 'Mahsulot qo\'shish', style: Theme.of(context).textTheme.headlineSmall),
                        ),
                        if (_editing)
                          IconButton(
                            onPressed: _deleting ? null : _delete,
                            icon: _deleting
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    if (_showTariffPicker) ...[
                      const Text('Tarif', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                      const SizedBox(height: 4),
                      const Text(
                        'Har bir mahsulot o\'z tarifiga ega bo\'ladi',
                        style: TextStyle(fontSize: 11.5, color: AppColors.gray),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final entry in kTariffConfig.entries)
                            ChoiceChip(
                              label: Text(entry.value.label),
                              selected: _tariff == entry.key,
                              onSelected: (_) => setState(() {
                                _tariff = entry.key;
                                _product = null;
                              }),
                              selectedColor: entry.value.color,
                              labelStyle: TextStyle(
                                color: _tariff == entry.key ? Colors.white : AppColors.ink,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],

                    if (!_customMode) ...[
                      const Text('Katalogdan tanlang', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                      const SizedBox(height: 8),
                      productsAsync.when(
                        loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: LinearProgressIndicator()),
                        error: (e, _) => Text('Xatolik: $e', style: const TextStyle(color: AppColors.danger)),
                        data: (allProducts) {
                          final products = allProducts
                              .where((p) => p.appliesToTariff(_tariff) && p.matchesSpecializations(specializations))
                              .toList();
                          if (products.isEmpty) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              child: Text(
                                allProducts.isEmpty
                                    ? "Katalogda hali mahsulot yo'q — admin panelda qo'shiladi"
                                    : specializations.isNotEmpty
                                        ? "Sizning mutaxassisligingizga mos mahsulot yo'q"
                                        : "Bu tarif (${kTariffConfig[_tariff]?.label ?? _tariff}) uchun mahsulot yo'q",
                                style: const TextStyle(color: AppColors.gray, fontSize: 12.5),
                              ),
                            );
                          }
                          return Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final p in products)
                                _ProductChip(
                                  product: p,
                                  selected: _product?.id == p.id,
                                  onTap: () => setState(() {
                                    _product = p;
                                    _nameController.text = p.name;
                                    _condition = null;
                                    _qty = 1;
                                  }),
                                ),
                            ],
                          );
                        },
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: () => setState(() {
                            _customMode = true;
                            _product = null;
                          }),
                          child: const Text("Katalogda yo'q — qo'lda kiritish"),
                        ),
                      ),
                    ] else ...[
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () => setState(() => _customMode = false),
                          icon: const Icon(Icons.arrow_back_rounded, size: 16),
                          label: const Text('Katalogdan tanlash'),
                        ),
                      ),
                    ],

                    const SizedBox(height: 14),
                    const Text('Nomi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                    const SizedBox(height: 6),
                    TextField(controller: _nameController, decoration: const InputDecoration(isDense: true)),

                    if (_customMode) ...[
                      const SizedBox(height: 14),
                      const Text('Narx (so\'m)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _customPriceController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(isDense: true, suffixText: "so'm"),
                      ),
                    ] else if (_product != null) ...[
                      const SizedBox(height: 16),
                      _buildCalcInputs(),
                      const SizedBox(height: 16),
                      const Text('Holati', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                      const SizedBox(height: 4),
                      Text(
                        'Mahsulotning ifloslanish darajasi — narxga ustama qo\'shadi',
                        style: TextStyle(fontSize: 11.5, color: AppColors.gray),
                      ),
                      const SizedBox(height: 8),
                      surchargesAsync.when(
                        loading: () => const SizedBox.shrink(),
                        error: (_, __) => const SizedBox.shrink(),
                        data: (surcharges) => Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final (key, label) in _conditions)
                              _ConditionChip(
                                label: label,
                                percent: surcharges.percentFor(key),
                                selected: _condition == key,
                                onTap: () => setState(() => _condition = key),
                              ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.payments_rounded, color: AppColors.primary, size: 20),
                          const SizedBox(width: 10),
                          const Text('Taxminiy narx', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                          const Spacer(),
                          Text(
                            "${_estimatedPrice.toStringAsFixed(0)} so'm",
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primary),
                          ),
                        ],
                      ),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                    ],

                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        style: FilledButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 16)),
                        child: _saving
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                            : Text(_editing ? 'SAQLASH' : "QO'SHISH", style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildCalcInputs() {
    final calcType = _product!.calcType;
    final tariffPrice = _product!.priceFor(_tariff);

    if (calcType == 'sqm') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('O\'lcham', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _sqmDirectMode = !_sqmDirectMode),
                child: Text(_sqmDirectMode ? 'Eni x Bo\'yi kiritish' : 'To\'g\'ridan m² kiritish', style: const TextStyle(fontSize: 12)),
              ),
            ],
          ),
          if (_sqmDirectMode)
            TextField(
              controller: _directAreaController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(isDense: true, suffixText: 'm²'),
            )
          else
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _widthController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(isDense: true, labelText: 'Eni (m)'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _heightController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(isDense: true, labelText: 'Bo\'yi (m)'),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 6),
          Text('Jami: ${_measuredQty.toStringAsFixed(2)} m² × ${(tariffPrice.unitPrice ?? 0).toStringAsFixed(0)} so\'m',
              style: const TextStyle(fontSize: 12, color: AppColors.grayDark)),
        ],
      );
    }

    if (calcType == 'size') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Hajmi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _SizeOption(
                  label: 'Kichik',
                  price: tariffPrice.smallPrice ?? 0,
                  selected: _sizeVariant == 'small',
                  onTap: () => setState(() => _sizeVariant = 'small'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SizeOption(
                  label: 'Katta',
                  price: tariffPrice.largePrice ?? 0,
                  selected: _sizeVariant == 'large',
                  onTap: () => setState(() => _sizeVariant = 'large'),
                ),
              ),
            ],
          ),
        ],
      );
    }

    // meter / kg / count — stepper
    final label = calcType == 'meter' ? 'Metr' : (calcType == 'kg' ? 'Kilogram' : 'Soni');
    final step = calcType == 'count' ? 1 : 0.5;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        const SizedBox(height: 8),
        Row(
          children: [
            _StepButton(icon: Icons.remove_rounded, onTap: () => setState(() => _qty = (_qty - step).clamp(0, 999999))),
            const SizedBox(width: 12),
            SizedBox(
              width: 70,
              child: TextField(
                controller: TextEditingController(text: _qty.toStringAsFixed(calcType == 'count' ? 0 : 1)),
                textAlign: TextAlign.center,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: calcType == 'count' ? [FilteringTextInputFormatter.digitsOnly] : [],
                onChanged: (v) => setState(() => _qty = num.tryParse(v.replaceAll(',', '.')) ?? 0),
                decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(vertical: 10)),
              ),
            ),
            const SizedBox(width: 12),
            _StepButton(icon: Icons.add_rounded, onTap: () => setState(() => _qty = _qty + step)),
            const SizedBox(width: 12),
            Text('× ${(tariffPrice.unitPrice ?? 0).toStringAsFixed(0)} so\'m', style: const TextStyle(fontSize: 12, color: AppColors.grayDark)),
          ],
        ),
      ],
    );
  }
}

class _ProductChip extends StatelessWidget {
  final Product product;
  final bool selected;
  final VoidCallback onTap;
  const _ProductChip({required this.product, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? AppColors.primary : AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_calcTypeIcons[product.calcType] ?? Icons.inventory_2_rounded, size: 15, color: selected ? Colors.white : AppColors.primary),
              const SizedBox(width: 6),
              Text(product.name, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: selected ? Colors.white : AppColors.ink)),
              const SizedBox(width: 4),
              Text(
                '(${_calcTypeLabels[product.calcType] ?? ''})',
                style: TextStyle(fontSize: 11, color: selected ? Colors.white.withValues(alpha: 0.8) : AppColors.gray),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConditionChip extends StatelessWidget {
  final String label;
  final num percent;
  final bool selected;
  final VoidCallback onTap;
  const _ConditionChip({required this.label, required this.percent, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = percent > 0 ? AppColors.danger : AppColors.grayDark;
    return Material(
      color: selected ? color : AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: selected ? color : AppColors.border)),
          child: Text(
            percent > 0 ? '$label (+${percent.toStringAsFixed(0)}%)' : label,
            style: TextStyle(color: selected ? Colors.white : AppColors.ink, fontWeight: FontWeight.w700, fontSize: 12),
          ),
        ),
      ),
    );
  }
}

class _SizeOption extends StatelessWidget {
  final String label;
  final num price;
  final bool selected;
  final VoidCallback onTap;
  const _SizeOption({required this.label, required this.price, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary.withValues(alpha: 0.08) : AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? AppColors.primary : AppColors.border, width: selected ? 1.5 : 1),
          ),
          child: Column(
            children: [
              Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: selected ? AppColors.primary : AppColors.ink)),
              const SizedBox(height: 2),
              Text('${price.toStringAsFixed(0)} so\'m', style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark)),
            ],
          ),
        ),
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _StepButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primary.withValues(alpha: 0.1),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 18, color: AppColors.primary),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/catalog_repository.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../shared/catalog_item_sheet.dart';

/// "XX XXX XX XX" ko'rinishida guruhlaydi (talab #3: telefon raqami
/// avtomatik formatlanishi) — 9 raqamdan ortig'ini qabul qilmaydi.
class _UzPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final rawDigits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final digits = rawDigits.length > 9 ? rawDigits.substring(0, 9) : rawDigits;
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);
      if ((i == 1 || i == 4 || i == 6) && i != digits.length - 1) buffer.write(' ');
    }
    final formatted = buffer.toString();
    return TextEditingValue(text: formatted, selection: TextSelection.collapsed(offset: formatted.length));
  }
}

/// Sotuv menejerining "Yangi buyurtma" formasi (talab #3): Ism familiya,
/// telefon (avtomat formatlangan), Mo'ljal, Xizmat turi. Olib kelish
/// (pickup) tanlanganda mahsulotlar SHU YERDA — inline, har biri o'z
/// tarifi bilan — qo'shiladi (running ro'yxat, jami summa, "Yana
/// qo'shish"). Joyida yuvish (onsite) uchun order-level tarif tanlanadi,
/// mahsulotlar esa jamoa tashrifida keyinroq qo'shiladi (o'zgarishsiz).
class NewOrderTab extends ConsumerStatefulWidget {
  final VoidCallback onSaved;

  const NewOrderTab({super.key, required this.onSaved});

  @override
  ConsumerState<NewOrderTab> createState() => _NewOrderTabState();
}

class _NewOrderTabState extends ConsumerState<NewOrderTab> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _locationController = TextEditingController();
  final _commentController = TextEditingController();
  final _notedItemsController = TextEditingController();
  final _estimatedPriceController = TextEditingController();
  final _phoneFocus = FocusNode();
  String? _serviceType;
  String? _source;
  String _onsiteTariff = 'standart';
  final List<CatalogItemDraft> _draftItems = [];
  bool _saving = false;
  String? _error;

  bool get _isPickup => _serviceType == 'pickup';

  num get _draftTotal => _draftItems.fold<num>(0, (s, d) => s + (d.price ?? 0));

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    _commentController.dispose();
    _notedItemsController.dispose();
    _estimatedPriceController.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }

  Future<void> _addItem() async {
    await openDraftItemSheet(context, onAdd: (draft) => setState(() => _draftItems.add(draft)));
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    if (_serviceType == null) {
      setState(() => _error = "Xizmat turini tanlang");
      return;
    }
    if (_isPickup && _draftItems.isEmpty) {
      setState(() => _error = "Kamida bitta mahsulot qo'shing");
      return;
    }

    setState(() => _saving = true);
    try {
      final digits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
      final notedItems = _notedItemsController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      final estimatedPrice = num.tryParse(_estimatedPriceController.text.replaceAll(',', '.'));
      final result = await ref.read(ordersRepositoryProvider).createOrder(
            customerName: _nameController.text.trim(),
            phone: '+998$digits',
            location: _locationController.text.trim(),
            serviceType: _serviceType!,
            tariff: _isPickup ? null : _onsiteTariff,
            items: _isPickup ? _draftItems : null,
            notedItems: _isPickup ? null : notedItems,
            estimatedPrice: _isPickup ? null : estimatedPrice,
            source: _source,
          );

      final commentText = _commentController.text.trim();
      if (commentText.isNotEmpty) {
        final claims = await ref.read(employeeClaimsProvider.future);
        final employee = await ref.read(currentEmployeeProvider.future);
        if (claims != null) {
          await ref.read(ordersRepositoryProvider).addComment(
                orderId: result.orderId,
                employeeId: claims.employeeId,
                authorName: employee?['fullName'] as String? ?? 'Xodim',
                text: commentText,
              );
        }
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ Buyurtma #${result.orderNumber} yaratildi')),
      );
      _nameController.clear();
      _phoneController.clear();
      _locationController.clear();
      _commentController.clear();
      _notedItemsController.clear();
      _estimatedPriceController.clear();
      setState(() {
        _serviceType = null;
        _source = null;
        _onsiteTariff = 'standart';
        _draftItems.clear();
        _saving = false;
      });
      widget.onSaved();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = describeApiError(e);
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Yangi buyurtma', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            const Text('Mijoz ma\'lumotlarini kiriting', style: TextStyle(color: AppColors.grayDark)),
            const SizedBox(height: 24),
            const _Label('Ism familiya'),
            TextFormField(controller: _nameController, textCapitalization: TextCapitalization.words),
            const SizedBox(height: 16),
            const _Label('Telefon raqam'),
            TextFormField(
              controller: _phoneController,
              focusNode: _phoneFocus,
              keyboardType: TextInputType.phone,
              inputFormatters: [_UzPhoneFormatter()],
              decoration: const InputDecoration(prefixText: '+998 '),
              onChanged: (v) {
                if (v.replaceAll(RegExp(r'\D'), '').length == 9) _phoneFocus.unfocus();
              },
              validator: (v) => (v == null || v.replaceAll(RegExp(r'\D'), '').length != 9) ? '9 xonali raqam kiriting' : null,
            ),
            const SizedBox(height: 16),
            const _Label('Mo\'ljal'),
            TextFormField(
              controller: _locationController,
              maxLines: 2,
              validator: (v) => (v == null || v.trim().isEmpty) ? "Mo'ljal majburiy" : null,
            ),
            const SizedBox(height: 20),
            const _Label('Manba (ixtiyoriy)'),
            const SizedBox(height: 8),
            ref.watch(orderSourcesProvider).when(
                  loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: LinearProgressIndicator()),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (sources) => sources.isEmpty
                      ? const SizedBox.shrink()
                      : Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final s in sources)
                              ChoiceChip(
                                label: Text(s.name),
                                selected: _source == s.id,
                                onSelected: (v) => setState(() => _source = v ? s.id : null),
                                labelStyle: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12.5,
                                  color: _source == s.id ? Colors.white : AppColors.ink,
                                ),
                                selectedColor: colorFromHex(s.color),
                                backgroundColor: AppColors.surface,
                                side: BorderSide(color: _source == s.id ? colorFromHex(s.color) : AppColors.border),
                              ),
                          ],
                        ),
                ),
            const SizedBox(height: 20),
            const _Label('Xizmat turi'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ChoiceCard(
                    label: 'Joyida yuvish',
                    icon: Icons.home_repair_service_rounded,
                    selected: _serviceType == 'onsite',
                    onTap: () => setState(() => _serviceType = 'onsite'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _ChoiceCard(
                    label: 'Olib kelish',
                    icon: Icons.local_shipping_rounded,
                    selected: _serviceType == 'pickup',
                    onTap: () => setState(() => _serviceType = 'pickup'),
                  ),
                ),
              ],
            ),
            if (_serviceType == 'onsite') ...[
              const SizedBox(height: 20),
              const _Label('Tarif'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final entry in kTariffConfig.entries)
                    _TariffCard(
                      tariffKey: entry.key,
                      selected: _onsiteTariff == entry.key,
                      onTap: () => setState(() => _onsiteTariff = entry.key),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              const _Label("Mahsulot nomlari (ixtiyoriy)"),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  "Mijoz aytgan mahsulotlarni vergul bilan ajratib yozing — masalan: Gilam, Parda, Yakandoz. Jamoa mijoz uyida haqiqiy mahsulotlarni aniqlashtirib qo'shadi.",
                  style: TextStyle(fontSize: 11.5, color: AppColors.gray),
                ),
              ),
              TextFormField(
                controller: _notedItemsController,
                decoration: const InputDecoration(hintText: 'Gilam, Parda, Yakandoz'),
              ),
              const SizedBox(height: 16),
              const _Label('Taxminiy umumiy summa (ixtiyoriy)'),
              TextFormField(
                controller: _estimatedPriceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(hintText: 'Masalan: 500000', suffixText: "so'm"),
              ),
            ],
            if (_isPickup) ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  const _Label('Mahsulotlar'),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: _addItem,
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: Text(_draftItems.isEmpty ? "Qo'shish" : 'Yana qo\'shish'),
                  ),
                ],
              ),
              if (_draftItems.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Hali mahsulot qo\'shilmagan', style: TextStyle(color: AppColors.gray, fontSize: 13)),
                )
              else ...[
                for (var i = 0; i < _draftItems.length; i++)
                  _DraftItemRow(
                    index: i,
                    draft: _draftItems[i],
                    onRemove: () => setState(() => _draftItems.removeAt(i)),
                  ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(14)),
                  child: Row(
                    children: [
                      const Text('Jami', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      const Spacer(),
                      Text("${_draftTotal.toStringAsFixed(0)} so'm", style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.primary)),
                    ],
                  ),
                ),
              ],
            ],
            const SizedBox(height: 20),
            const _Label("Izoh (ixtiyoriy)"),
            TextFormField(controller: _commentController, maxLines: 2),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                    : const Text('TASDIQLASH', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.5)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DraftItemRow extends StatelessWidget {
  final int index;
  final CatalogItemDraft draft;
  final VoidCallback onRemove;
  const _DraftItemRow({required this.index, required this.draft, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final tariffInfo = draft.tariff != null ? kTariffConfig[draft.tariff] : null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
            child: Text('${index + 1}', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 11.5)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(draft.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                if (tariffInfo != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(tariffInfo.label, style: TextStyle(fontSize: 11, color: tariffInfo.color, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
          Text("${(draft.price ?? 0).toStringAsFixed(0)} so'm", style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.grayDark)),
          IconButton(
            onPressed: onRemove,
            icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.gray),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
    );
  }
}

class _ChoiceCard extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ChoiceCard({required this.label, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary.withValues(alpha: 0.08) : AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: selected ? AppColors.primary : AppColors.border, width: selected ? 1.5 : 1),
          ),
          child: Column(
            children: [
              Icon(icon, color: selected ? AppColors.primary : AppColors.grayDark),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: selected ? AppColors.primary : AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TariffCard extends StatelessWidget {
  final String tariffKey;
  final bool selected;
  final VoidCallback onTap;

  const _TariffCard({required this.tariffKey, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final info = kTariffConfig[tariffKey]!;
    return Material(
      color: selected ? info.color : info.background,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          width: 148,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? info.color : info.color.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                info.label,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                  color: selected ? Colors.white : info.color,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                info.daysLabel,
                style: TextStyle(
                  fontSize: 11.5,
                  color: selected ? Colors.white.withValues(alpha: 0.85) : info.color.withValues(alpha: 0.8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/catalog_repository.dart';
import '../../core/services/customer_search.dart';
import '../../core/services/tariff_settings.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/launch_utils.dart';
import '../../core/utils/phone_format.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../search/global_search_screen.dart';
import '../shared/catalog_item_sheet.dart';
import '../../core/utils/money_utils.dart';

/// Sotuv menejerining "Yangi buyurtma" formasi (talab #3).
///
/// Telefon raqam BIRINCHI kiritiladi: to'liq raqam yozilishi bilan mijoz
/// tekshiriladi va oldin buyurtma bergan bo'lsa ismi, manzili va GPS'i
/// avtomatik to'ldiriladi ("Ko'rish" — uning barcha buyurtmalari). Keyin
/// Manzil, Xizmat turi. Olib kelish (pickup) tanlanganda mahsulotlar SHU
/// YERDA — inline, har biri o'z tarifi bilan — qo'shiladi. Joyida yuvish
/// (onsite) uchun order-level tarif tanlanadi, mahsulotlar esa jamoa
/// tashrifida keyinroq qo'shiladi.
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

  // --- Telefon bo'yicha mijozni tekshirish ---
  _Lookup _lookup = _Lookup.idle;
  CustomerResult? _customer;

  /// Qaysi raqam uchun tekshirilgan (yoki tekshirilmoqda).
  String? _customerDigits;

  /// Javobi kelguncha raqam o'zgarsa eski javob tashlab yuboriladi.
  int _lookupSeq = 0;

  /// Avtomatik yozilgan qiymatlar — xodim ularni o'zgartirmagan bo'lsa,
  /// raqam almashganda (boshqa mijoz) tozalanadi; o'zi yozganiga tegilmaydi.
  String? _filledName;
  String? _filledLocation;

  /// Mijozning eng so'nggi GPS'i va u tegishli manzil.
  ({String gps, String location})? _gps;

  bool get _isPickup => _serviceType == 'pickup' || _serviceType == 'walkin';
  bool get _isWalkIn => _serviceType == 'walkin';

  num get _draftTotal => _draftItems.fold<num>(0, (s, d) => s + (d.price ?? 0));

  String get _phoneDigits => _phoneController.text.replaceAll(RegExp(r'\D'), '');

  /// GPS faqat manzil u olingan buyurtmadagidek qolsa yuboriladi —
  /// manzil o'zgartirilsa eski nuqta noto'g'ri joyga olib boradi.
  String? get _effectiveGps {
    final gps = _gps;
    if (gps == null) return null;
    return _sameAddress(_locationController.text, gps.location) ? gps.gps : null;
  }

  static bool _sameAddress(String a, String b) {
    String norm(String s) => s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
    return norm(a) == norm(b);
  }

  void _onPhoneChanged(String value) {
    final digits = _phoneDigits;
    if (_lookup != _Lookup.idle && digits != _customerDigits) _resetLookup();
    if (digits.length == 9) {
      _phoneFocus.unfocus();
      if (_lookup == _Lookup.idle) _lookUpCustomer(digits);
    }
  }

  Future<void> _lookUpCustomer(String digits) async {
    final seq = ++_lookupSeq;
    setState(() {
      _lookup = _Lookup.loading;
      _customerDigits = digits;
    });
    _Lookup status;
    CustomerResult? customer;
    try {
      final result = await ref.read(customerSearchProvider).lookupPhone(digits);
      customer = result.customer;
      status = customer != null
          ? _Lookup.found
          : result.fromCache
              ? _Lookup.unchecked
              : _Lookup.newCustomer;
    } catch (_) {
      status = _Lookup.unchecked;
    }
    if (!mounted || seq != _lookupSeq) return;
    setState(() {
      _lookup = status;
      _customer = customer;
      if (customer != null) _autofill(customer);
    });
  }

  void _autofill(CustomerResult customer) {
    bool untouched(TextEditingController c, String? filled) => c.text.trim().isEmpty || c.text == filled;

    final name = customer.customerName.trim();
    if (name.isNotEmpty && untouched(_nameController, _filledName)) {
      _nameController.text = name;
      _filledName = name;
    }
    final location = customer.latestLocation;
    if (location != null && untouched(_locationController, _filledLocation)) {
      _locationController.text = location;
      _filledLocation = location;
    }
    _gps = customer.latestGps;
  }

  /// Raqam o'zgardi — avvalgi mijoz uchun yozilganlar olib tashlanadi.
  void _resetLookup() {
    setState(() {
      if (_filledName != null && _nameController.text == _filledName) _nameController.clear();
      if (_filledLocation != null && _locationController.text == _filledLocation) _locationController.clear();
      _clearLookup();
    });
  }

  /// Tekshiruv natijasini unutadi; kech kelgan javob ham e'tiborsiz qoladi.
  void _clearLookup() {
    _lookupSeq++;
    _lookup = _Lookup.idle;
    _customer = null;
    _customerDigits = null;
    _filledName = null;
    _filledLocation = null;
    _gps = null;
  }

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
    // Talab: mahsulot qo'shish endi ixtiyoriy — lekin unutmaslik uchun
    // qattiq bloklash o'rniga eslatma bilan tasdiqlash so'raladi.
    if (_isPickup && _draftItems.isEmpty) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text("Mahsulot qo'shilmagan"),
          content: const Text(
            "Siz hali biror mahsulot qo'shmadingiz. Mahsulotsiz davom etasizmi, ular keyinroq qo'shilishi mumkin?",
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Orqaga')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Davom etish')),
          ],
        ),
      );
      if (proceed != true) return;
    }

    setState(() => _saving = true);
    try {
      final digits = _phoneDigits;
      // Mijoz tekshirilgan bo'lsa GPS haqida forma o'zi qaror qiladi;
      // aks holda (internet yo'q edi) server eski GPS'ni o'zi topadi.
      final gpsChecked = _customerDigits == digits && (_lookup == _Lookup.found || _lookup == _Lookup.newCustomer);
      final notedItems = _notedItemsController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      final estimatedPrice = num.tryParse(_estimatedPriceController.text.replaceAll(',', '.'));
      final actorName = ref.read(currentEmployeeProvider).valueOrNull?['fullName'] as String?;
      final result = await ref.read(ordersRepositoryProvider).createOrder(
            customerName: _nameController.text.trim(),
            phone: '+998$digits',
            location: _locationController.text.trim(),
            serviceType: _isPickup ? 'pickup' : 'onsite',
            tariff: _isPickup ? null : _onsiteTariff,
            gpsCoords: gpsChecked ? _effectiveGps : null,
            gpsChecked: gpsChecked,
            items: _isPickup ? _draftItems : null,
            notedItems: _isPickup ? null : notedItems,
            estimatedPrice: _isPickup ? null : estimatedPrice,
            source: _source,
            walkIn: _isWalkIn,
            actorName: actorName,
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
        SnackBar(
          content: Text(
            result.orderNumber > 0
                ? '✅ Buyurtma #${result.orderNumber} yaratildi'
                : '✅ Buyurtma saqlandi — raqami internet tiklanganda beriladi',
          ),
        ),
      );
      _nameController.clear();
      _phoneController.clear();
      _locationController.clear();
      _commentController.clear();
      _notedItemsController.clear();
      _estimatedPriceController.clear();
      setState(() {
        _clearLookup();
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

  List<Widget> _lookupResult() {
    final customer = _customer;
    return switch (_lookup) {
      _Lookup.found when customer != null => [
          const SizedBox(height: 10),
          _KnownCustomerBanner(
            customer: customer,
            onView: () => openGlobalSearch(context, initialPhone: _customerDigits),
          ),
        ],
      _Lookup.newCustomer => const [
          SizedBox(height: 8),
          _LookupNote(icon: Icons.person_add_alt_1_rounded, text: 'Yangi mijoz — avval buyurtma bermagan'),
        ],
      _Lookup.unchecked => [
          const SizedBox(height: 8),
          _LookupNote(
            icon: Icons.cloud_off_rounded,
            text: "Internet yo'q — mijoz tekshirilmadi",
            onRetry: () => _lookUpCustomer(_phoneDigits),
          ),
        ],
      _ => const [],
    };
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
            const Text(
              "Telefon raqamdan boshlang — avval kelgan mijoz avtomatik aniqlanadi",
              style: TextStyle(color: AppColors.grayDark),
            ),
            const SizedBox(height: 24),
            const _Label('Telefon raqam'),
            TextFormField(
              controller: _phoneController,
              focusNode: _phoneFocus,
              keyboardType: TextInputType.phone,
              inputFormatters: [UzPhoneFormatter()],
              decoration: InputDecoration(
                prefixText: '+998 ',
                suffixIcon: _lookup == _Lookup.loading
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2)),
                      )
                    : null,
              ),
              onChanged: _onPhoneChanged,
              validator: (v) => (v == null || v.replaceAll(RegExp(r'\D'), '').length != 9) ? '9 xonali raqam kiriting' : null,
            ),
            ..._lookupResult(),
            const SizedBox(height: 16),
            const _Label('Ism familiya'),
            TextFormField(controller: _nameController, textCapitalization: TextCapitalization.words),
            const SizedBox(height: 16),
            const _Label('Manzil'),
            TextFormField(
              controller: _locationController,
              maxLines: 2,
              // GPS belgisi manzil o'zgarishiga qarab yonadi/o'chadi.
              onChanged: _gps == null ? null : (_) => setState(() {}),
              validator: (v) => (v == null || v.trim().isEmpty) ? "Manzil majburiy" : null,
            ),
            if (_effectiveGps case final gps?) ...[
              const SizedBox(height: 8),
              _GpsRow(gps: gps, onRemove: () => setState(() => _gps = null)),
            ],
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
                const SizedBox(width: 10),
                Expanded(
                  child: _ChoiceCard(
                    label: 'Olib kelish',
                    icon: Icons.local_shipping_rounded,
                    selected: _serviceType == 'pickup',
                    onTap: () => setState(() => _serviceType = 'pickup'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _ChoiceCard(
                    label: "O'zi keldi",
                    icon: Icons.storefront_rounded,
                    selected: _serviceType == 'walkin',
                    onTap: () => setState(() => _serviceType = 'walkin'),
                  ),
                ),
              ],
            ),
            if (_isWalkIn) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: const Text(
                  "Mijoz do'konga o'zi keldi — buyurtma dastavchiklarga ko'rinmaydi, to'g'ridan to'g'ri ishchilar navbatiga (Kutilmoqda) tushadi.",
                  style: TextStyle(fontSize: 11.5, color: AppColors.ink, fontWeight: FontWeight.w600),
                ),
              ),
            ],
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
                      const Expanded(child: Text('Jami', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                      Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(formatMoneyUz(_draftTotal), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.primary)),
                ),
              ),
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

/// Telefon bo'yicha mijoz tekshiruvi: [unchecked] — internet yo'q yoki
/// xato, ya'ni mijoz yangi ekani ANIQ emas.
enum _Lookup { idle, loading, found, newCustomer, unchecked }

/// "Bu mijozga oldin ham xizmat ko'rsatilgan" — telefon maydoni ostida.
class _KnownCustomerBanner extends StatelessWidget {
  final CustomerResult customer;
  final VoidCallback onView;

  const _KnownCustomerBanner({required this.customer, required this.onView});

  @override
  Widget build(BuildContext context) {
    final last = customer.orders.first.createdAt;
    final lastLabel = last.year == DateTime.now().year ? formatDateUz(last) : '${formatDateUz(last)} ${last.year}';
    final active = customer.active.length;
    final details = [
      '${customer.orders.length} ta buyurtma',
      'oxirgisi $lastLabel',
      if (active > 0) '$active tasi faol',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      decoration: BoxDecoration(
        color: AppColors.success.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.success.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.verified_user_rounded, size: 20, color: AppColors.success),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Bu mijozga oldin ham xizmat ko'rsatilgan",
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  details,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.grayDark),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onView,
            style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10)),
            child: const Text("Ko'rish", style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

class _LookupNote extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback? onRetry;

  const _LookupNote({required this.icon, required this.text, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.grayDark),
        const SizedBox(width: 6),
        Expanded(
          child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.grayDark)),
        ),
        if (onRetry != null)
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
            child: const Text('Qayta tekshirish'),
          ),
      ],
    );
  }
}

/// Mijozning avvalgi buyurtmasidan olingan GPS — xaritada tekshirish yoki
/// olib tashlash mumkin.
class _GpsRow extends StatelessWidget {
  final String gps;
  final VoidCallback onRemove;

  const _GpsRow({required this.gps, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 2, 2, 2),
      decoration: BoxDecoration(color: AppColors.info.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          const Icon(Icons.location_on_rounded, size: 18, color: AppColors.info),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'GPS avvalgi buyurtmadan',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.ink),
            ),
          ),
          TextButton(
            onPressed: () => showGpsOnMap(gps),
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
            child: const Text('Xaritada'),
          ),
          IconButton(
            onPressed: onRemove,
            tooltip: 'GPS ni olib tashlash',
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.grayDark),
          ),
        ],
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
                Text(
                  draft.name,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                if (tariffInfo != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(tariffInfo.label, style: TextStyle(fontSize: 11, color: tariffInfo.color, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(formatMoneyUz(draft.price ?? 0), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.grayDark)),
                ),
              ),
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

class _TariffCard extends ConsumerWidget {
  final String tariffKey;
  final bool selected;
  final VoidCallback onTap;

  const _TariffCard({required this.tariffKey, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = kTariffConfig[tariffKey]!;
    // Muddat sozlamadan o'qiladi: sotuv menejeri tarif tanlayotganda
    // aynan server hisoblaydigan kunni ko'rishi kerak.
    final days = (ref.tariffs[tariffKey] ?? kDefaultTariffs[tariffKey]!).days;
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
                '$days kunlik',
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

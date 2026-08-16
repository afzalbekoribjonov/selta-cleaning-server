import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';

/// Dispetcherning "Yangi buyurtma" formasi (talab #11): Ism familiya,
/// Telefon raqam, Mo'ljal, Xizmat turi (majburiy tanlov), Tarif.
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
  String? _serviceType;
  String _tariff = 'standart';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    if (_serviceType == null) {
      setState(() => _error = "Xizmat turini tanlang");
      return;
    }

    setState(() => _saving = true);
    try {
      final digits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
      final result = await ref.read(ordersRepositoryProvider).createOrder(
            customerName: _nameController.text.trim(),
            phone: '+998$digits',
            location: _locationController.text.trim(),
            serviceType: _serviceType!,
            tariff: _tariff,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ Buyurtma #${result.orderNumber} yaratildi')),
      );
      _nameController.clear();
      _phoneController.clear();
      _locationController.clear();
      setState(() {
        _serviceType = null;
        _tariff = 'standart';
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
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
              decoration: const InputDecoration(prefixText: '+998 '),
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
                    selected: _tariff == entry.key,
                    onTap: () => setState(() => _tariff = entry.key),
                  ),
              ],
            ),
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
                    : const Text('SAQLASH', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.5)),
              ),
            ),
          ],
        ),
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

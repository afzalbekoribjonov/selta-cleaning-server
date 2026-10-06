import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart' show openAppSettings;

import '../../app/theme.dart';
import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';
import '../../core/printing/receipt_settings.dart';
import 'order_receipt.dart' show receiptDateTime;
import 'print_flow.dart' show showPrintOutcome;

/// Sinov cheki — printer, qog'oz eni va logotip to'g'ri ekanini tekshirish.
Receipt testReceipt(ReceiptSettings settings, PaperWidth paper, DateTime now) => Receipt([
      if (settings.showLogo) const ReceiptLogo(),
      if (settings.title.isNotEmpty) ReceiptText(settings.title, align: ReceiptAlign.center, bold: true, large: true),
      const ReceiptText('SINOV CHEKI', align: ReceiptAlign.center, bold: true),
      const ReceiptDivider('='),
      ReceiptPair('Sana:', receiptDateTime(now)),
      ReceiptPair("Qog'oz:", '${paper.mm} mm (${paper.chars} belgi)'),
      const ReceiptDivider(),
      const ReceiptText('ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'),
      const ReceiptText("O'zbekcha: o'g'il, g'oz, so'm"),
      ReceiptText(('1234567890' * 5).substring(0, paper.chars)),
      const ReceiptPair("Baland qator:", "123 000 so'm", bold: true, tall: true),
      const ReceiptDivider(),
      const ReceiptText('Printer ishlayapti!', align: ReceiptAlign.center),
    ]);

/// Chek printeri (shu telefon uchun): juftlangan printerni tanlash, qog'oz
/// eni, oxiridagi bo'sh joy va sinov cheki.
///
/// [pickForPrint] — chop etish paytida printer tanlanmagan bo'lsa ochiladi:
/// printer tanlanishi bilan `true` bilan yopiladi va chop etish davom etadi.
class PrinterSettingsScreen extends ConsumerStatefulWidget {
  final bool pickForPrint;

  const PrinterSettingsScreen({super.key, this.pickForPrint = false});

  @override
  ConsumerState<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends ConsumerState<PrinterSettingsScreen> {
  List<PrinterDevice>? _devices;
  PrintOutcome? _problem;
  bool _loading = false;
  bool _testing = false;

  /// Printer tanlandimi — ekran yopilganda chaqiruvchiga qaytariladi.
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    // Printer tanlash uchun kelgan bo'lsa — ro'yxat darhol ochiladi.
    if (widget.pickForPrint || !ref.read(printerConfigProvider).isSelected) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadDevices());
    }
  }

  Future<void> _loadDevices() async {
    setState(() {
      _loading = true;
      _problem = null;
    });
    final result = await ref.read(printerServiceProvider).pairedPrinters();
    if (!mounted) return;
    setState(() {
      _loading = false;
      _problem = result.problem;
      _devices = result.problem == null ? result.devices : null;
    });
  }

  Future<void> _select(PrinterDevice device) async {
    final notifier = ref.read(printerConfigProvider.notifier);
    await notifier.save(ref.read(printerConfigProvider).copyWith(mac: device.mac, name: device.name));
    if (!mounted) return;
    if (widget.pickForPrint) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _changed = true;
      _devices = null;
    });
  }

  Future<void> _test() async {
    final config = ref.read(printerConfigProvider);
    final settings = ref.read(receiptSettingsProvider).valueOrNull ?? const ReceiptSettings();
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _testing = true);
    try {
      final outcome = await ref
          .read(printerServiceProvider)
          .printLines(layoutReceipt(testReceipt(settings, config.paper, DateTime.now()), config.paper));
      showPrintOutcome(messenger, outcome);
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(printerConfigProvider);
    final notifier = ref.read(printerConfigProvider.notifier);
    final devices = _devices;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(widget.pickForPrint ? 'Printerni tanlang' : 'Chek printeri')),
        body: ListView(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 24 + MediaQuery.paddingOf(context).bottom),
          children: [
            _SelectedCard(config: config, onForget: config.isSelected ? notifier.forgetPrinter : null),
            const SizedBox(height: 14),
            if (_problem != null) ...[
              _Notice(
                text: _problem!.message,
                danger: true,
                action: _problem!.needsAppSettings
                    ? const TextButton(onPressed: openAppSettings, child: Text('Sozlamalarni ochish'))
                    : TextButton(onPressed: _loadDevices, child: const Text('Qayta urinish')),
              ),
              const SizedBox(height: 14),
            ],
            if (_loading)
              const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Center(child: CircularProgressIndicator()))
            else
              FilledButton.icon(
                onPressed: _loadDevices,
                icon: const Icon(Icons.bluetooth_searching_rounded, size: 19),
                label: Text(config.isSelected ? 'Boshqa printer tanlash' : 'Printerni tanlash'),
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              ),
            if (!_loading && devices != null) ...[
              const SizedBox(height: 16),
              if (devices.isEmpty)
                const _Notice(
                  text: "Juftlangan qurilma topilmadi. Printerni yoqing va telefonning Bluetooth sozlamasidan "
                      "unga ulaning (PIN odatda 0000 yoki 1234), so'ng \"Printerni tanlash\"ni qayta bosing.",
                )
              else ...[
                const _SectionTitle('Juftlangan qurilmalar'),
                for (final d in devices)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: Icon(
                        d.isPrinter ? Icons.print_rounded : Icons.bluetooth_rounded,
                        color: d.isPrinter ? AppColors.primary : AppColors.grayDark,
                      ),
                      title: Text(d.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(d.mac, style: const TextStyle(fontSize: 12)),
                      trailing: d.mac == config.mac
                          ? const Icon(Icons.check_circle_rounded, color: AppColors.success)
                          : const Icon(Icons.chevron_right_rounded),
                      onTap: () => _select(d),
                    ),
                  ),
              ],
            ],
            const SizedBox(height: 22),
            const _SectionTitle("Qog'oz eni", hint: "Chek juda tor yoki qatorlar bo'linib chiqsa — shu yerdan o'zgartiring."),
            SegmentedButton<PaperWidth>(
              segments: const [
                ButtonSegment(value: PaperWidth.mm58, label: Text('58 mm')),
                ButtonSegment(value: PaperWidth.mm80, label: Text('80 mm')),
              ],
              selected: {config.paper},
              showSelectedIcon: false,
              onSelectionChanged: (s) => notifier.save(config.copyWith(paper: s.first)),
            ),
            const SizedBox(height: 22),
            const _SectionTitle("Chek oxiridagi bo'sh joy", hint: "Chek yirtish chizig'idan o'tib chiqishi uchun qancha qator qo'shilsin."),
            _FeedStepper(
              value: config.feedLines,
              onChanged: (v) => notifier.save(config.copyWith(feedLines: v)),
            ),
            const SizedBox(height: 22),
            OutlinedButton.icon(
              onPressed: config.isSelected && !_testing ? _test : null,
              icon: _testing
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.receipt_long_rounded, size: 19),
              label: Text(_testing ? 'Yuborilmoqda...' : 'Sinov cheki'),
              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
            ),
            const SizedBox(height: 18),
            const _Notice(
              text: "Chek chiqmasa: printer yoniq va qog'ozi borligini, telefonga juftlanganini, "
                  "boshqa telefon unga ulanib turmaganini tekshiring. Chek har safar ulanib chiqariladi "
                  "va oxirida ulanish yopiladi — printer boshqa telefonlar uchun ham bo'sh qoladi.",
            ),
          ],
        ),
      ),
    );
  }
}

class _SelectedCard extends StatelessWidget {
  final PrinterConfig config;
  final VoidCallback? onForget;
  const _SelectedCard({required this.config, required this.onForget});

  @override
  Widget build(BuildContext context) {
    final selected = config.isSelected;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 6, 14),
      decoration: BoxDecoration(
        color: selected ? AppColors.primary.withValues(alpha: 0.07) : AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: selected ? AppColors.primary.withValues(alpha: 0.25) : AppColors.border),
      ),
      child: Row(
        children: [
          Icon(
            selected ? Icons.print_rounded : Icons.print_disabled_rounded,
            color: selected ? AppColors.primary : AppColors.grayDark,
            size: 26,
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  selected ? (config.name ?? config.mac!) : 'Printer tanlanmagan',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                Text(
                  selected ? '${config.mac} · ${config.paper.mm} mm' : 'Chek chiqarish uchun printerni tanlang',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark),
                ),
              ],
            ),
          ),
          if (onForget != null)
            IconButton(tooltip: 'Printerni olib tashlash', icon: const Icon(Icons.close_rounded, size: 20), onPressed: onForget),
        ],
      ),
    );
  }
}

class _FeedStepper extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;
  const _FeedStepper({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton.outlined(
          onPressed: value > PrinterConfig.minFeed ? () => onChanged(value - 1) : null,
          tooltip: 'Kamaytirish',
          icon: const Icon(Icons.remove_rounded),
        ),
        Expanded(
          child: Text(
            '$value qator',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        ),
        IconButton.outlined(
          onPressed: value < PrinterConfig.maxFeed ? () => onChanged(value + 1) : null,
          tooltip: "Ko'paytirish",
          icon: const Icon(Icons.add_rounded),
        ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  final String text;
  final bool danger;
  final Widget? action;
  const _Notice({required this.text, this.danger = false, this.action});

  @override
  Widget build(BuildContext context) {
    final color = danger ? AppColors.danger : AppColors.info;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(danger ? Icons.error_outline_rounded : Icons.info_outline_rounded, size: 18, color: color),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  text,
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                    color: danger ? AppColors.danger : AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          if (action != null) Align(alignment: Alignment.centerRight, child: action),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  final String? hint;
  const _SectionTitle(this.text, {this.hint});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            if (hint != null) ...[
              const SizedBox(height: 2),
              Text(hint!, style: const TextStyle(fontSize: 12, color: AppColors.grayDark)),
            ],
          ],
        ),
      );
}

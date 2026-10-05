import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart' show openAppSettings;

import '../../app/theme.dart';
import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';
import '../../core/printing/receipt_settings.dart';
import 'order_receipt.dart' show receiptDateTime;

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
      const ReceiptDivider(),
      const ReceiptText('Printer ishlayapti!', align: ReceiptAlign.center),
    ]);

/// Printer sozlamasi (shu qurilma uchun): juftlangan printerni tanlash,
/// qog'oz eni va sinov cheki.
class PrinterSettingsScreen extends ConsumerStatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  ConsumerState<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends ConsumerState<PrinterSettingsScreen> {
  List<PrinterDevice>? _devices;
  PrintException? _error;
  bool _loading = false;
  bool _testing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final devices = await ref.read(printerServiceProvider).pairedPrinters();
      if (mounted) setState(() => _devices = devices);
    } on PrintException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _test() async {
    final config = ref.read(printerConfigProvider);
    final settings = ref.read(receiptSettingsProvider).valueOrNull ?? const ReceiptSettings();
    setState(() => _testing = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(printerServiceProvider).printLines(layoutReceipt(testReceipt(settings, config.paper, DateTime.now()), config.paper));
      messenger.showSnackBar(const SnackBar(content: Text('✅ Sinov cheki chop etildi')));
    } on PrintException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(printerConfigProvider);
    final notifier = ref.read(printerConfigProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Printer'),
        actions: [
          IconButton(onPressed: _loading ? null : _load, tooltip: 'Yangilash', icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.info.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, size: 18, color: AppColors.info),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    "Printerni avval telefonning Bluetooth sozlamasida juftlang (PIN odatda 0000 yoki 1234). "
                    "Keyin u shu ro'yxatda chiqadi — tanlang va sinov chekini chiqaring.",
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.ink, height: 1.35),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const _Label("Qog'oz eni"),
          SegmentedButton<PaperWidth>(
            segments: const [
              ButtonSegment(value: PaperWidth.mm58, label: Text('58 mm')),
              ButtonSegment(value: PaperWidth.mm80, label: Text('80 mm')),
            ],
            selected: {config.paper},
            showSelectedIcon: false,
            onSelectionChanged: (s) => notifier.save(config.copyWith(paper: s.first)),
          ),
          const SizedBox(height: 18),
          const _Label('Juftlangan qurilmalar'),
          if (_loading)
            const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            _ErrorBox(error: _error!, onRetry: _load)
          else if (_devices != null && _devices!.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                "Juftlangan qurilma yo'q. Telefon sozlamasidan printerni juftlang va \"Yangilash\"ni bosing.",
                style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600),
              ),
            )
          else
            for (final d in _devices ?? const <PrinterDevice>[])
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: Icon(
                    d.mac == config.mac ? Icons.check_circle_rounded : Icons.print_rounded,
                    color: d.mac == config.mac ? AppColors.success : AppColors.grayDark,
                  ),
                  title: Text(d.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(d.mac, style: const TextStyle(fontSize: 12)),
                  onTap: () => notifier.save(config.copyWith(mac: d.mac, name: d.name)),
                ),
              ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: config.isSelected && !_testing ? _test : null,
            icon: _testing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.receipt_long_rounded),
            label: const Text('Sinov cheki', style: TextStyle(fontWeight: FontWeight.w800)),
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          ),
        ],
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final PrintException error;
  final VoidCallback onRetry;
  const _ErrorBox({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(error.message, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton(onPressed: onRetry, child: const Text('Qayta urinish')),
              if (error.openSettings) const OutlinedButton(onPressed: openAppSettings, child: Text('Sozlamalarni ochish')),
            ],
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
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
      );
}

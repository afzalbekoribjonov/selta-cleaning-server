import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/printing/escpos_encoder.dart' show kReceiptLogoAsset;
import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';
import 'print_flow.dart';
import 'printer_settings_screen.dart';

/// Chekni oldindan ko'rish va chop etish. Ekrandagi qatorlar printerga
/// ketadiganlarning AYNAN o'zi (bir xil joylashuv), shuning uchun xodim
/// qog'ozda nima chiqishini oldindan ko'radi.
Future<void> openReceiptPreview(BuildContext context, {required Receipt receipt, required String title}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => ReceiptPreviewSheet(receipt: receipt, title: title),
  );
}

class ReceiptPreviewSheet extends ConsumerStatefulWidget {
  final Receipt receipt;
  final String title;

  const ReceiptPreviewSheet({super.key, required this.receipt, required this.title});

  @override
  ConsumerState<ReceiptPreviewSheet> createState() => _ReceiptPreviewSheetState();
}

class _ReceiptPreviewSheetState extends ConsumerState<ReceiptPreviewSheet> {
  bool _printing = false;

  Future<void> _print() async {
    setState(() => _printing = true);
    try {
      final outcome = await printReceiptFlow(context, ref, widget.receipt);
      if (outcome?.isOk == true && mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(printerConfigProvider);
    final lines = layoutReceipt(widget.receipt, config.paper);

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 12, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleLarge),
                  ),
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
                ],
              ),
            ),
            _PrinterRow(config: config),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                children: [ReceiptPaper(lines: lines, paper: config.paper)],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    // Printer tanlanmagan bo'lsa — avval tanlash, keyin o'zi chop etadi.
                    onPressed: _printing ? null : _print,
                    icon: _printing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.print_rounded),
                    label: Text(
                      _printing ? 'CHOP ETILMOQDA...' : 'CHOP ETISH',
                      style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.4),
                    ),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrinterRow extends StatelessWidget {
  final PrinterConfig config;
  const _PrinterRow({required this.config});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => const PrinterSettingsScreen())),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
            child: Row(
              children: [
                Icon(
                  config.isSelected ? Icons.print_rounded : Icons.print_disabled_rounded,
                  size: 20,
                  color: config.isSelected ? AppColors.primary : AppColors.grayDark,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    config.isSelected ? '${config.name ?? config.mac} · ${config.paper.mm} mm' : 'Printer tanlanmagan',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                ),
                const Text("O'zgartirish", style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 12.5)),
                const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Chekdagi bitta qator: katta (eni va bo'yi ×2) yoki baland (faqat bo'yi ×2).
class _PaperLine extends StatelessWidget {
  final PrintedLine line;
  final double fontSize;
  const _PaperLine({required this.line, required this.fontSize});

  @override
  Widget build(BuildContext context) {
    final text = Text(
      line.text,
      maxLines: 1,
      softWrap: false,
      overflow: TextOverflow.clip,
      style: TextStyle(
        fontFamily: 'monospace',
        fontSize: line.large ? fontSize * 2 : fontSize,
        height: 1.25,
        fontWeight: line.bold ? FontWeight.w800 : FontWeight.w400,
        color: Colors.black,
      ),
    );
    if (!line.tall) return text;
    // Baland qator: harflar bo'yiga cho'ziladi, eni o'zgarmaydi.
    return SizedBox(
      height: fontSize * 1.25 * 2,
      child: Transform.scale(scaleX: 1, scaleY: 2, alignment: Alignment.topLeft, child: text),
    );
  }
}

/// Chek qog'ozi ko'rinishi — monospace shrift, qog'oz enidagi belgilar
/// soniga moslangan o'lcham (har qanday ekranda bir qator = bir qator).
class ReceiptPaper extends StatelessWidget {
  final List<PrintedLine> lines;
  final PaperWidth paper;

  const ReceiptPaper({super.key, required this.lines, required this.paper});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(6),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              // Monospace belgi eni ≈ 0.6 × shrift o'lchami. Shrift kattalash
              // sozlamasi chek ko'rinishini buzmasligi uchun o'chiriladi —
              // qator aynan qog'ozdagidek sig'ishi kerak.
              final fontSize = (constraints.maxWidth / (paper.chars * 0.62)).clamp(6.0, 16.0);
              return MediaQuery(
                data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final line in lines)
                      if (line.isLogo)
                        // Printerga ketadigan logoning o'zi (384 nuqta: 58 mm da
                        // to'liq en, 80 mm da markazda).
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Center(
                            child: FractionallySizedBox(
                              widthFactor: 384 / paper.dots,
                              child: Image.asset(kReceiptLogoAsset, filterQuality: FilterQuality.medium),
                            ),
                          ),
                        )
                      else
                        _PaperLine(line: line, fontSize: fontSize),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

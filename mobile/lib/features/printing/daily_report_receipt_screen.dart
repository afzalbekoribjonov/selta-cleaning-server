import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart' show openAppSettings;

import '../../app/theme.dart';
import '../../core/printing/printer_service.dart';
import '../../core/printing/receipt.dart';
import '../../core/services/auth_service.dart' show apiClientProvider, authStateProvider, describeApiError, employeeClaimsProvider;
import '../../core/services/local_store.dart';
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/sync/action_queue.dart' show idTokenProvider;
import '../../core/sync/cached_fetch.dart';
import '../stats/daily_stats_screen.dart' show DayPickerBar;
import 'receipt_preview_sheet.dart' show ReceiptPaper;

/// Kunlik hisobot cheki huquqi: admin yoki "Kunlik hisobot cheki" vakolati.
bool canPrintDailyReport(Map<String, dynamic>? employee, String? role) =>
    role == 'admin' || employee?['canPrintDailyReport'] == true;

/// Server hisoblagan chek bloklari (server: routes/receipt.ts). Internetsiz —
/// oxirgi olingan nusxa (bugun uchun faqat shu kuni olingani).
final dailyReceiptProvider = FutureProvider.autoDispose.family<Receipt, String>((ref, dateKey) async {
  ref.watch(authStateProvider);
  final employeeId = (await ref.watch(employeeClaimsProvider.future))?.employeeId ?? '';
  final isToday = dateKey == dateKeyOf(DateTime.now());
  final raw = await fetchWithCache(
    ref.read(localStoreProvider),
    'cache.dailyReceipt.$employeeId.$dateKey',
    () async {
      final token = await ref.read(idTokenProvider)();
      return ref.read(apiClientProvider).post('/dailyReceiptReport', idToken: token, body: {'date': dateKey});
    },
    usable: isToday ? savedToday : (_) => true,
  );
  return Receipt.fromBlocks((raw['blocks'] as List?) ?? const []);
});

/// "Kunlik hisobot cheki" — xodimlar bo'yicha kunning to'liq ishi
/// (sotuv, yuvish/upakovka hajmi, olib kelish/yetkazish, qo'ldagi pul),
/// bazadan hisoblangan; kalendar bilan istalgan kun.
class DailyReportReceiptScreen extends ConsumerStatefulWidget {
  const DailyReportReceiptScreen({super.key});

  @override
  ConsumerState<DailyReportReceiptScreen> createState() => _DailyReportReceiptScreenState();
}

class _DailyReportReceiptScreenState extends ConsumerState<DailyReportReceiptScreen> {
  DateTime _day = DateUtils.dateOnly(DateTime.now());
  bool _printing = false;

  Future<void> _print(List<PrintedLine> lines) async {
    setState(() => _printing = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(printerServiceProvider).printLines(lines);
      messenger.showSnackBar(const SnackBar(content: Text('✅ Kunlik hisobot chop etildi')));
    } on PrintException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(e.message),
          action: e.openSettings ? const SnackBarAction(label: 'Sozlamalar', onPressed: openAppSettings) : null,
        ),
      );
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = dailyReceiptProvider(dateKeyOf(_day));
    final receiptAsync = ref.watch(provider);
    final config = ref.watch(printerConfigProvider);
    final lines = receiptAsync.valueOrNull == null ? null : layoutReceipt(receiptAsync.value!, config.paper);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kunlik hisobot cheki'),
        actions: [
          IconButton(onPressed: () => ref.invalidate(provider), tooltip: 'Yangilash', icon: const Icon(Icons.refresh_rounded)),
          IconButton(onPressed: () => context.push('/printer'), tooltip: 'Printer', icon: const Icon(Icons.settings_rounded)),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: DayPickerBar(day: _day, onChanged: (d) => setState(() => _day = DateUtils.dateOnly(d))),
          ),
          Expanded(
            child: receiptAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.cloud_off_rounded, size: 40, color: AppColors.gray),
                      const SizedBox(height: 10),
                      Text(describeApiError(e), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: () => ref.invalidate(provider), child: const Text('Qayta urinish')),
                    ],
                  ),
                ),
              ),
              data: (_) => RefreshIndicator(
                onRefresh: () async => ref.invalidate(provider),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
                  children: [ReceiptPaper(lines: lines!, paper: config.paper)],
                ),
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: lines == null || _printing
                      ? null
                      : config.isSelected
                          ? () => _print(lines)
                          : () => context.push('/printer'),
                  icon: _printing
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Icon(config.isSelected ? Icons.print_rounded : Icons.bluetooth_searching_rounded),
                  label: Text(
                    config.isSelected ? 'CHOP ETISH' : 'PRINTERNI TANLASH',
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
    );
  }
}

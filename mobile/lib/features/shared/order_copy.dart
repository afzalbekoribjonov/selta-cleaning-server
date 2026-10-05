import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import 'item_detail_row.dart' show itemMeasurementLabel;

/// Buyurtmaning tartibli matnli nusxasi — Telegram yoki SMS orqali
/// yuborish uchun:
///
///   Buyurtma #1245
///   Mijoz: Aziz Karimov
///   Telefon: +998 90 123 45 67
///
///   Mahsulotlar (2):
///   1. 1245/1 · Gilam — 12.00 m² (3×4) — 360 000 so'm
///   2. 1245/2 · Parda — 2 dona — 80 000 so'm
///
///   Jami: 440 000 so'm
///
/// Faqat buyurtmaga tegishli ma'lumot — ichki izohlar, xodim ismlari va
/// to'lov tafsilotlari ATAYLAB kirmaydi: matn mijozga ham yuborilishi mumkin.
String formatOrderForCopy(Order order, List<OrderItem> items) {
  final lines = <String>[
    'Buyurtma ${order.displayNumber}',
    'Mijoz: ${order.customerName.isEmpty ? "Noma'lum" : order.customerName}',
    'Telefon: ${formatPhoneUz(order.phone)}',
  ];

  if (items.isNotEmpty) {
    lines
      ..add('')
      ..add('Mahsulotlar (${items.length}):');
    for (var i = 0; i < items.length; i++) {
      final item = items[i];
      final size = itemMeasurementLabel(item);
      final parts = [
        '${i + 1}. ${order.awaitingNumber ? '#' : item.subId(order.orderNumber)} · ${item.name}',
        if (size.isNotEmpty) size,
        formatMoneyUz(item.price),
      ];
      lines.add(parts.join(' — '));
    }
  }

  final total = items.isEmpty ? order.totalPrice : items.fold<num>(0, (s, i) => s + i.price);
  lines
    ..add('')
    ..add('Jami: ${formatMoneyUz(total)}');
  return lines.join('\n');
}

/// Ichki kartaning sarlavhasidagi "Nusxa olish" tugmasi.
///
/// Tasdiq tugmaning o'zida (belgi bir lahza ✓ ga aylanadi): ichki karta
/// pastki oyna, SnackBar esa uning ORTIDA chiqib ko'rinmay qolardi.
class CopyOrderButton extends StatefulWidget {
  final Order order;

  /// Ekranda ko'rinib turgan mahsulotlar (hali yuklanmagan bo'lsa `null`).
  final List<OrderItem>? items;

  const CopyOrderButton({super.key, required this.order, required this.items});

  @override
  State<CopyOrderButton> createState() => _CopyOrderButtonState();
}

class _CopyOrderButtonState extends State<CopyOrderButton> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: formatOrderForCopy(widget.order, widget.items!)));
    HapticFeedback.lightImpact();
    if (!mounted) return;
    setState(() => _copied = true);
    await Future<void>.delayed(const Duration(milliseconds: 1600));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: _copied ? 'Nusxalandi' : 'Nusxa olish',
      onPressed: widget.items == null ? null : _copy,
      style: IconButton.styleFrom(
        backgroundColor: _copied ? AppColors.success.withValues(alpha: 0.12) : AppColors.surface,
        foregroundColor: _copied ? AppColors.success : AppColors.primary,
      ),
      icon: Icon(_copied ? Icons.check_rounded : Icons.copy_rounded, size: 20),
    );
  }
}

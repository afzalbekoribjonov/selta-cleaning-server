import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/printing/receipt_settings.dart';
import '../../core/services/auth_service.dart' show employeeClaimsProvider;
import '../../core/services/employee_repository.dart';
import 'order_receipt.dart';
import 'receipt_preview_sheet.dart';

/// Chek chiqarish huquqi: admin yoki "Chek chiqarish" vakolati.
bool canPrintReceipts(Map<String, dynamic>? employee, String? role) =>
    role == 'admin' || employee?['canPrintReceipts'] == true;

/// Ichki kartadagi "Chek" tugmasi (nusxa olish yonida). Vakolat bo'lmasa
/// umuman ko'rinmaydi; mahsulotlar hali yuklanmagan bo'lsa o'chiq.
class PrintReceiptButton extends ConsumerWidget {
  final Order order;
  final List<OrderItem>? items;

  const PrintReceiptButton({super.key, required this.order, required this.items});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employee = ref.watch(currentEmployeeProvider).valueOrNull;
    final role = ref.watch(employeeClaimsProvider).valueOrNull?.role;
    if (!canPrintReceipts(employee, role)) return const SizedBox.shrink();

    final items = this.items;
    return IconButton(
      tooltip: 'Chek chiqarish',
      onPressed: items == null
          ? null
          : () {
              final settings = ref.read(receiptSettingsProvider).valueOrNull ?? const ReceiptSettings();
              final receipt = buildOrderReceipt(
                order: order,
                items: items,
                settings: settings,
                now: DateTime.now(),
                cashier: employee?['fullName'] as String?,
              );
              openReceiptPreview(context, receipt: receipt, title: 'Chek · ${order.displayNumber}');
            },
      icon: const Icon(Icons.print_rounded, color: AppColors.primary),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import 'item_detail_row.dart';

/// `ItemDetailRow` + item o'zining ITEM_PIPELINE bosqichiga mos harakat
/// tugmasi (talab #3/#5/#9/#10): pending->washing, washing->packing,
/// packing'da ✅/❌ (har biri o'z tasdiqlash oynasi bilan — istalgan
/// ishchi bajara oladi, Sifat nazorati bo'limi shart emas), returned'dan
/// "Yuvishni boshlash", ready'dan dastavchik tomonidan "Yetkazildi"
/// (qisman yetkazish — har bir item alohida). Joyida-yuvish itemlarida
/// (status==null) yoki harakat qilish huquqi bo'lmagan rolларда faqat
/// oddiy holat ko'rsatiladi, tugma yo'q.
class ItemActionRow extends ConsumerStatefulWidget {
  final Order order;
  final OrderItem item;
  final bool editable;
  final VoidCallback? onEdit;

  const ItemActionRow({
    super.key,
    required this.order,
    required this.item,
    this.editable = false,
    this.onEdit,
  });

  @override
  ConsumerState<ItemActionRow> createState() => _ItemActionRowState();
}

class _ItemActionRowState extends ConsumerState<ItemActionRow> {
  bool _busy = false;
  String? _error;

  Future<void> _changeStatus(String toStatus, {String? qcNote, num? collectedAmount}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).changeItemStatus(
            orderId: widget.order.id,
            itemId: widget.item.id,
            toStatus: toStatus,
            qcNote: qcNote,
            collectedAmount: collectedAmount,
          );
    } catch (e) {
      if (mounted) setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmFail() async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mahsulot rad etildi'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Sabab (ixtiyoriy)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Qaytarish'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _changeStatus('returned', qcNote: controller.text.trim().isEmpty ? null : controller.text.trim());
    }
  }

  Future<void> _confirmPass() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Mahsulot tasdiqlandi"),
        content: Text('"${widget.item.name}" yetkazishga tayyor deb belgilansinmi?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Tasdiqlash')),
        ],
      ),
    );
    if (confirmed == true) await _changeStatus('ready');
  }

  Future<void> _confirmDeliver() async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mijozga yetkazildi'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Qabul qilingan summa (ixtiyoriy)', suffixText: "so'm"),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Tasdiqlash')),
        ],
      ),
    );
    if (confirmed == true) {
      final amount = num.tryParse(controller.text.replaceAll(',', '.'));
      await _changeStatus('done', collectedAmount: amount != null && amount > 0 ? amount : null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final employeeData = ref.watch(currentEmployeeProvider).valueOrNull;
    final department = employeeData?['department'] as String?;
    final specializations =
        (employeeData?['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    final canPack = employeeData?['canPack'] as bool? ?? false;
    final status = widget.item.status;

    // Talab: xodimda lavozim (mutaxassislik/upakovkachi) bo'lmasa,
    // buyurtma holatini o'zgartira olmaydi. Yuvish bilan bog'liq
    // o'tishlar mahsulot toifasiga mos mutaxassislikni, upakovka esa
    // "upakovkachi" huquqini talab qiladi — server ham xuddi shu
    // qoidani tekshiradi (orders.ts: assertWorkerLavozim).
    final category = widget.item.category;
    final hasWashingLavozim = specializations.isNotEmpty && (category == null || specializations.contains(category));
    final isWorker = department == 'worker';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ItemDetailRow(
          item: widget.item,
          subId: widget.item.subId(widget.order.orderNumber),
          editable: widget.editable,
          onTap: widget.editable ? widget.onEdit : null,
        ),
        if (_busy)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: LinearProgressIndicator(minHeight: 2),
          )
        else ...[
          if ((status == 'pending' || status == 'washing' || status == 'returned') && isWorker) ...[
            if (hasWashingLavozim)
              _ActionButton(
                label: status == 'washing' ? "Upakovkaga o'tkazish" : 'Yuvishni boshlash',
                icon: status == 'washing' ? Icons.inventory_rounded : Icons.local_laundry_service_rounded,
                onTap: () => _changeStatus(status == 'washing' ? 'packing' : 'washing'),
              )
            else
              _LavozimHint(
                text: specializations.isEmpty
                    ? "Sizga hali lavozim (mutaxassislik) belgilanmagan — admin bilan bog'laning"
                    : "Bu mahsulot toifasi sizning mutaxassisligingizga mos emas",
              ),
          ],
          if (status == 'packing' && isWorker) ...[
            if (canPack)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _confirmFail,
                        icon: const Icon(Icons.close_rounded, size: 16, color: AppColors.danger),
                        label: const Text('Rad etish', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
                        style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.danger)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _confirmPass,
                        icon: const Icon(Icons.check_rounded, size: 16),
                        label: const Text('Tasdiqlash', style: TextStyle(fontWeight: FontWeight.w700)),
                        style: FilledButton.styleFrom(backgroundColor: AppColors.success),
                      ),
                    ),
                  ],
                ),
              )
            else
              const _LavozimHint(text: "Sizga upakovkachi huquqi berilmagan — admin bilan bog'laning"),
          ],
          if (status == 'ready' && department == 'delivery')
            _ActionButton(label: 'Mijozga yetkazildi', icon: Icons.check_circle_rounded, onTap: _confirmDeliver),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        const Divider(height: 1),
      ],
    );
  }
}

class _LavozimHint extends StatelessWidget {
  final String text;
  const _LavozimHint({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
      child: Row(
        children: [
          const Icon(Icons.lock_outline_rounded, size: 14, color: AppColors.warning),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 11.5, color: AppColors.warning, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _ActionButton({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 16),
          label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}

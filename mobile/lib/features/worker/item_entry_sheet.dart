import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError;
import '../../core/services/orders_repository.dart';

/// Ishchi buyurtmaga mahsulotlarni belgilaydi — har biriga tartib raqami
/// serverda avtomatik beriladi (talab #3/#6). Bir nechta qatorni ketma-ket
/// kiritish mumkin.
Future<void> openItemEntrySheet(BuildContext context, String orderId) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _ItemEntrySheet(orderId: orderId),
  );
}

class _ItemRowData {
  final nameController = TextEditingController(text: 'Gilam');
  final areaController = TextEditingController();
  final priceController = TextEditingController();
}

class _ItemEntrySheet extends ConsumerStatefulWidget {
  final String orderId;
  const _ItemEntrySheet({required this.orderId});

  @override
  ConsumerState<_ItemEntrySheet> createState() => _ItemEntrySheetState();
}

class _ItemEntrySheetState extends ConsumerState<_ItemEntrySheet> {
  final List<_ItemRowData> _rows = [_ItemRowData()];
  bool _saving = false;
  String? _error;

  void _addRow() => setState(() => _rows.add(_ItemRowData()));

  void _removeRow(int i) {
    if (_rows.length == 1) return;
    setState(() => _rows.removeAt(i));
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      final items = _rows
          .map((r) => (
                name: r.nameController.text.trim().isEmpty ? 'Mahsulot' : r.nameController.text.trim(),
                area: num.tryParse(r.areaController.text.replaceAll(',', '.')) ?? 0,
                price: num.tryParse(r.priceController.text.replaceAll(',', '.')) ?? 0,
              ))
          .toList();

      await ref.read(ordersRepositoryProvider).addOrderItems(orderId: widget.orderId, items: items);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = describeApiError(e);
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  children: [
                    Text('Mahsulotlarni belgilash', style: Theme.of(context).textTheme.titleLarge),
                    const Spacer(),
                    TextButton.icon(onPressed: _addRow, icon: const Icon(Icons.add_rounded), label: const Text('Qo\'shish')),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  itemCount: _rows.length,
                  itemBuilder: (context, i) => _rowCard(i),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                child: Column(
                  children: [
                    if (_error != null) ...[
                      Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 10),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving ? null : _submit,
                        style: FilledButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 16)),
                        child: _saving
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                            : const Text('SAQLASH', style: TextStyle(fontWeight: FontWeight.w800)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _rowCard(int i) {
    final row = _rows[i];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('${i + 1}-mahsulot', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.grayDark)),
              const Spacer(),
              if (_rows.length > 1)
                IconButton(
                  onPressed: () => _removeRow(i),
                  icon: const Icon(Icons.close_rounded, size: 18),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          TextField(controller: row.nameController, decoration: const InputDecoration(labelText: 'Nomi', isDense: true)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: row.areaController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Maydon (m²)', isDense: true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: row.priceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Narx (so\'m)', isDense: true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

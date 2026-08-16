import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/constants.dart';
import '../../core/models/order.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';

void openOrderDetailSheet(BuildContext context, Order order) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _OrderDetailSheet(order: order),
  );
}

class _OrderDetailSheet extends StatelessWidget {
  final Order order;
  const _OrderDetailSheet({required this.order});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.bg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                  children: [
                    _Header(order: order),
                    const SizedBox(height: 20),
                    _InfoCard(order: order),
                    const SizedBox(height: 20),
                    _ProgressChecklist(order: order),
                    const SizedBox(height: 20),
                    _CommentsSection(order: order),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  final Order order;
  const _Header({required this.order});

  @override
  Widget build(BuildContext context) {
    final status = statusOf(order.status);
    final tariff = tariffOf(order.tariff);
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Buyurtma #${order.orderNumber}', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 6),
              Row(
                children: [
                  _pill(status.label, status.color, status.background),
                  const SizedBox(width: 8),
                  _pill(tariff.label, tariff.color, tariff.background),
                ],
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: () => showDialog(context: context, builder: (_) => _EditOrderDialog(order: order)),
          icon: const Icon(Icons.edit_rounded),
          style: IconButton.styleFrom(backgroundColor: AppColors.surface, foregroundColor: AppColors.primary),
        ),
      ],
    );
  }

  Widget _pill(String label, Color color, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
      );
}

class _InfoCard extends StatelessWidget {
  final Order order;
  const _InfoCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _row(Icons.person_rounded, order.customerName.isEmpty ? "Noma'lum mijoz" : order.customerName),
          _row(Icons.phone_rounded, order.phone),
          _row(Icons.location_on_rounded, order.location),
          _row(
            order.serviceType == 'onsite' ? Icons.home_repair_service_rounded : Icons.local_shipping_rounded,
            order.serviceType == 'onsite' ? 'Joyida yuvish' : 'Olib kelish',
          ),
          if (order.dueDate != null)
            _row(
              Icons.event_rounded,
              'Muddat: ${formatDateUz(order.dueDate!)}',
              color: order.isOverdue ? AppColors.danger : null,
            ),
          _row(Icons.access_time_rounded, 'Qabul qilindi: ${formatDateTimeUz(order.createdAt)}'),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String text, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: color ?? AppColors.gray),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, color: color ?? AppColors.ink, fontWeight: color != null ? FontWeight.w700 : FontWeight.w500))),
          ],
        ),
      );
}

/// Progress checklist — talab: "Dispetcher buyurtmani tekshirishda buyurtma
/// holati bo'yicha bajarilgan va qolgan qismlari ko'rsatilishi kerak".
/// Faqat ko'rish uchun — status o'zgartirish dispetcherga tegishli emas
/// (bu ishchi/dastavchik/QC vazifasi).
class _ProgressChecklist extends StatelessWidget {
  final Order order;
  const _ProgressChecklist({required this.order});

  @override
  Widget build(BuildContext context) {
    final pipeline = kServicePipeline[order.serviceType] ?? kServicePipeline['pickup']!;
    final currentIndex = pipeline.indexOf(order.status);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Jarayon', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 12),
          for (var i = 0; i < pipeline.length; i++) _step(pipeline[i], i, currentIndex, isLast: i == pipeline.length - 1),
        ],
      ),
    );
  }

  Widget _step(String status, int index, int currentIndex, {required bool isLast}) {
    final info = statusOf(status);
    final done = index < currentIndex;
    final current = index == currentIndex;
    final color = done || current ? info.color : AppColors.gray;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? color : (current ? Colors.white : AppColors.bg),
                  border: Border.all(color: color, width: 2),
                ),
                child: done
                    ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                    : (current ? Center(child: Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle))) : null),
              ),
              if (!isLast) Expanded(child: Container(width: 2, color: done ? color : AppColors.border)),
            ],
          ),
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              info.label,
              style: TextStyle(
                fontWeight: current ? FontWeight.w800 : FontWeight.w600,
                fontSize: 13.5,
                color: done || current ? AppColors.ink : AppColors.gray,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentsSection extends ConsumerStatefulWidget {
  final Order order;
  const _CommentsSection({required this.order});

  @override
  ConsumerState<_CommentsSection> createState() => _CommentsSectionState();
}

class _CommentsSectionState extends ConsumerState<_CommentsSection> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final claims = await ref.read(employeeClaimsProvider.future);
    final employee = await ref.read(currentEmployeeProvider.future);
    if (claims == null) return;

    setState(() => _sending = true);
    try {
      await ref.read(ordersRepositoryProvider).addComment(
            orderId: widget.order.id,
            employeeId: claims.employeeId,
            authorName: employee?['fullName'] as String? ?? 'Xodim',
            text: text,
          );
      _controller.clear();
      if (mounted) FocusScope.of(context).unfocus();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final commentsAsync = ref.watch(_commentsProvider(widget.order.id));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Izohlar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(hintText: 'Izoh yozing...', isDense: true),
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.send_rounded),
                style: IconButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white),
              ),
            ],
          ),
          const SizedBox(height: 12),
          commentsAsync.when(
            loading: () => const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
            error: (e, _) => Text('Xatolik: $e', style: const TextStyle(color: AppColors.danger)),
            data: (comments) {
              if (comments.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Hali izoh yo\'q', style: TextStyle(color: AppColors.gray, fontSize: 13)),
                );
              }
              return Column(
                children: [
                  for (final c in comments) _CommentTile(comment: c),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

final _commentsProvider = StreamProvider.family<List<Map<String, dynamic>>, String>((ref, orderId) {
  return ref.watch(ordersRepositoryProvider).watchComments(orderId);
});

class _CommentTile extends StatelessWidget {
  final Map<String, dynamic> comment;
  const _CommentTile({required this.comment});

  @override
  Widget build(BuildContext context) {
    final createdAt = comment['createdAt'];
    String timeLabel = '';
    if (createdAt != null && createdAt is Timestamp) {
      timeLabel = formatDateTimeUz(createdAt.toDate());
    }
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(comment['authorName']?.toString() ?? 'Xodim', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
              const Spacer(),
              Text(timeLabel, style: const TextStyle(fontSize: 11, color: AppColors.gray)),
            ],
          ),
          const SizedBox(height: 4),
          Text(comment['text']?.toString() ?? '', style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }
}

class _EditOrderDialog extends ConsumerStatefulWidget {
  final Order order;
  const _EditOrderDialog({required this.order});

  @override
  ConsumerState<_EditOrderDialog> createState() => _EditOrderDialogState();
}

class _EditOrderDialogState extends ConsumerState<_EditOrderDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _locationController;
  late String _tariff;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.order.customerName);
    _phoneController = TextEditingController(text: widget.order.phone.replaceFirst('+998', ''));
    _locationController = TextEditingController(text: widget.order.location);
    _tariff = widget.order.tariff;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final digits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
      await ref.read(ordersRepositoryProvider).updateOrder(
            orderId: widget.order.id,
            customerName: _nameController.text.trim(),
            phone: '+998$digits',
            location: _locationController.text.trim(),
            tariff: _tariff,
          );
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
    return AlertDialog(
      title: const Text('Buyurtmani tahrirlash'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Ism familiya')),
            const SizedBox(height: 12),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
              decoration: const InputDecoration(labelText: 'Telefon', prefixText: '+998 '),
            ),
            const SizedBox(height: 12),
            TextField(controller: _locationController, maxLines: 2, decoration: const InputDecoration(labelText: "Mo'ljal")),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in kTariffConfig.entries)
                  ChoiceChip(
                    label: Text(entry.value.label),
                    selected: _tariff == entry.key,
                    onSelected: (_) => setState(() => _tariff = entry.key),
                    selectedColor: entry.value.color,
                    labelStyle: TextStyle(color: _tariff == entry.key ? Colors.white : AppColors.ink, fontWeight: FontWeight.w700),
                  ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('Bekor qilish')),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Saqlash'),
        ),
      ],
    );
  }
}

import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show authStateProvider, employeeClaimsProvider;
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';

/// Har bir buyurtma tafsilotida ishlatiladigan izohlar bo'limi (talab #10:
/// "har bir xodim buyurtmaga izoh qoldirish imkoniyatiga ega bo'lishi
/// kerak") — barcha bo'lim ekranlari shu bitta komponentni ishlatadi.
class CommentsSection extends ConsumerStatefulWidget {
  final String orderId;
  const CommentsSection({super.key, required this.orderId});

  @override
  ConsumerState<CommentsSection> createState() => _CommentsSectionState();
}

class _CommentsSectionState extends ConsumerState<CommentsSection> {
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
            orderId: widget.orderId,
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
    final commentsAsync = ref.watch(_commentsProvider(widget.orderId));
    final claimsAsync = ref.watch(employeeClaimsProvider);
    final currentEmployeeId = claimsAsync.value?.employeeId;

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
                  for (final c in comments)
                    _CommentTile(
                      orderId: widget.orderId,
                      comment: c,
                      canEdit: currentEmployeeId != null && c['authorId'] == currentEmployeeId,
                    ),
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
  ref.watch(authStateProvider);
  return ref.watch(ordersRepositoryProvider).watchComments(orderId);
});

class _CommentTile extends ConsumerStatefulWidget {
  final String orderId;
  final Map<String, dynamic> comment;
  final bool canEdit;
  const _CommentTile({required this.orderId, required this.comment, required this.canEdit});

  @override
  ConsumerState<_CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends ConsumerState<_CommentTile> {
  bool _editing = false;
  bool _saving = false;
  late final TextEditingController _controller = TextEditingController(text: widget.comment['text']?.toString() ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(ordersRepositoryProvider).editComment(
            orderId: widget.orderId,
            commentId: widget.comment['id'].toString(),
            text: text,
          );
      if (mounted) setState(() => _editing = false);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final createdAt = widget.comment['createdAt'];
    String timeLabel = '';
    if (createdAt != null && createdAt is Timestamp) {
      timeLabel = formatDateTimeUz(createdAt.toDate());
    }
    final edited = widget.comment['editedAt'] != null;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(widget.comment['authorName']?.toString() ?? 'Xodim', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
              const Spacer(),
              Text(timeLabel, style: const TextStyle(fontSize: 11, color: AppColors.gray)),
              if (widget.canEdit && !_editing) ...[
                const SizedBox(width: 6),
                InkWell(
                  onTap: () => setState(() => _editing = true),
                  child: const Icon(Icons.edit_rounded, size: 15, color: AppColors.gray),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          if (_editing)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _controller,
                  autofocus: true,
                  minLines: 1,
                  maxLines: 4,
                  decoration: const InputDecoration(isDense: true),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: _saving ? null : () => setState(() => _editing = false),
                      child: const Text('Bekor qilish'),
                    ),
                    const SizedBox(width: 4),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Saqlash'),
                    ),
                  ],
                ),
              ],
            )
          else
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(widget.comment['text']?.toString() ?? '', style: const TextStyle(fontSize: 13))),
                if (edited) ...[
                  const SizedBox(width: 6),
                  const Text('(tahrirlangan)', style: TextStyle(fontSize: 11, color: AppColors.gray, fontStyle: FontStyle.italic)),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show authStateProvider, employeeClaimsProvider;
import '../../core/services/connectivity_service.dart';
import '../../core/services/employee_repository.dart';
import '../../core/services/orders_repository.dart';
import '../../core/utils/date_utils.dart';
import '../../core/widgets/load_error_note.dart';

/// Har bir buyurtma tafsilotida ishlatiladigan izohlar bo'limi (talab #10:
/// "har bir xodim buyurtmaga izoh qoldirish imkoniyatiga ega bo'lishi
/// kerak") — barcha bo'lim ekranlari shu bitta komponentni ishlatadi.
class CommentsSection extends ConsumerStatefulWidget {
  final String orderId;

  /// Ochilishi bilan shu bo'limgacha aylantirish (kartadagi izoh bosilganda).
  final bool focus;
  const CommentsSection({super.key, required this.orderId, this.focus = false});

  @override
  ConsumerState<CommentsSection> createState() => _CommentsSectionState();
}

class _CommentsSectionState extends ConsumerState<CommentsSection> {
  final _controller = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.focus) {
      // Varaq ochilish animatsiyasi tugab, joylashuv aniq bo'lgach.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Scrollable.ensureVisible(
          context,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeOutCubic,
          alignment: 0.02,
        );
      });
    }
  }
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
            error: (e, _) => LoadErrorNote(error: e),
            data: (result) {
              final comments = result.comments;
              if (comments.isEmpty) {
                // Keshdagi bo'sh ro'yxat — internet bo'lsa server javobi
                // kutiladi, bo'lmasa "izoh yo'q" deb adashtirilmaydi.
                if (result.fromCache) {
                  final online = ref.watch(connectivityProvider).valueOrNull ?? true;
                  return online
                      ? const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator())
                      : const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            "Internet yo'q — izohlar hali yuklanmagan",
                            style: TextStyle(color: AppColors.gray, fontSize: 13),
                          ),
                        );
                }
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

/// `autoDispose` + qisqa ushlab turish — mahsulotlar provideri bilan bir
/// xil sabab: avval bu `autoDispose`SIZ edi va xodim ochgan HAR BIR
/// buyurtmaning izohlar obunasi ilova yopilguncha ochiq qolardi.
final _commentsProvider =
    StreamProvider.autoDispose.family<({List<Map<String, dynamic>> comments, bool fromCache}), String>((ref, orderId) {
  ref.watch(authStateProvider);
  final link = ref.keepAlive();
  Timer? release;
  ref.onCancel(() => release = Timer(const Duration(minutes: 3), link.close));
  ref.onResume(() => release?.cancel());
  ref.onDispose(() => release?.cancel());
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
      final createdAt = widget.comment['createdAt'];
      await ref.read(ordersRepositoryProvider).editComment(
            orderId: widget.orderId,
            commentId: widget.comment['id'].toString(),
            text: text,
            authorName: widget.comment['authorName']?.toString(),
            createdAt: createdAt is Timestamp ? createdAt.toDate() : null,
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
              Expanded(
                child: Text(
                  widget.comment['authorName']?.toString() ?? 'Xodim',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5),
                ),
              ),
              const SizedBox(width: 8),
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

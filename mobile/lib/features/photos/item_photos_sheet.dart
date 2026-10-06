import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/item_photo.dart';
import '../../core/models/order_item.dart';
import '../../core/photos/photo_queue.dart';
import '../../core/photos/photo_services.dart';
import '../../core/services/connectivity_service.dart';
import '../../core/services/order_items_provider.dart';
import 'photo_image.dart';
import 'photo_viewer.dart';

/// Mahsulot rasmlari oynasi: "eski" va "tayyor" holat, har biriga 2 tadan.
Future<void> showItemPhotosSheet(
  BuildContext context, {
  required String orderId,
  required OrderItem item,
  required String subId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => ItemPhotosSheet(orderId: orderId, item: item, subId: subId),
  );
}

class ItemPhotosSheet extends ConsumerWidget {
  final String orderId;
  final OrderItem item;
  final String subId;

  const ItemPhotosSheet({super.key, required this.orderId, required this.item, required this.subId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Jonli: yuklangan/o'chirilgan rasm darhol ko'rinadi.
    final live = ref.watch(orderItemsProvider(orderId)).valueOrNull?.where((i) => i.id == item.id).firstOrNull ?? item;
    final ops = ref.watch(photoQueueProvider);
    final perms = ref.watch(photoPermissionsProvider);
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final failed = ops.where((o) => o.failed && o.orderId == orderId && o.itemId == item.id).toList();

    final slots = {for (final s in PhotoState.values) s: photoSlotsOf(orderId, live, s, ops)};
    final title = '$subId · ${live.name}';

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: const Icon(Icons.photo_library_rounded, color: AppColors.primary, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Rasmlar', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.ink)),
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.grayDark),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    tooltip: 'Yopish',
                    icon: const Icon(Icons.close_rounded, color: AppColors.grayDark),
                  ),
                ],
              ),
              for (final state in PhotoState.values) ...[
                const SizedBox(height: 16),
                _StateSection(
                  state: state,
                  slots: slots[state]!,
                  perms: perms,
                  online: online,
                  onAdd: () => _add(context, ref, live, state, slots[state]!.length),
                  onOpen: (slot) => _open(context, ref, live, slots, slot, perms),
                  onRemove: (slot) => _remove(context, ref, live, slot),
                ),
              ],
              if (failed.isNotEmpty) ...[
                const SizedBox(height: 16),
                for (final op in failed) _FailedOpTile(op: op),
              ],
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(online ? Icons.offline_pin_rounded : Icons.cloud_off_rounded, size: 18, color: AppColors.grayDark),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        online
                            ? "Ko'rilgan rasmlar telefonda saqlanadi va qayta yuklanmaydi."
                            : "Internet yo'q. Olingan rasmlar telefonda saqlanadi va ulanish tiklanishi bilan o'zi yuklanadi.",
                        style: const TextStyle(fontSize: 12, height: 1.35, color: AppColors.grayDark),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _label(OrderItem live, PhotoState state) => '$subId ${live.name} — ${state.label.toLowerCase()} rasm';

  Future<void> _add(BuildContext context, WidgetRef ref, OrderItem live, PhotoState state, int used) async {
    final remaining = kMaxPhotosPerState - used;
    if (remaining <= 0) return;
    final camera = await _chooseSource(context);
    if (camera == null || !context.mounted) return;

    final queue = ref.read(photoQueueProvider.notifier);
    final messenger = ScaffoldMessenger.of(context);
    final label = _label(live, state);
    try {
      if (camera) await queue.rememberCapture(orderId: orderId, itemId: live.id, state: state, label: label);
      final paths = await ref.read(photoPickerProvider).pick(camera: camera, max: remaining);
      if (camera) await queue.forgetCapture();
      if (paths.isEmpty) return;
      await queue.addFiles(orderId: orderId, itemId: live.id, state: state, label: label, paths: paths.take(remaining).toList());
    } on PhotoPickException catch (e) {
      await queue.forgetCapture();
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      await queue.forgetCapture();
      messenger.showSnackBar(const SnackBar(content: Text("Rasmni saqlab bo'lmadi — qaytadan urinib ko'ring")));
    }
  }

  Future<bool?> _chooseSource(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
            child: Row(
              children: [
                Expanded(
                  child: _SourceButton(
                    icon: Icons.photo_camera_rounded,
                    label: 'Kamera',
                    onTap: () => Navigator.of(context).pop(true),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SourceButton(
                    icon: Icons.photo_library_rounded,
                    label: 'Galereya',
                    onTap: () => Navigator.of(context).pop(false),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _open(
    BuildContext context,
    WidgetRef ref,
    OrderItem live,
    Map<PhotoState, List<PhotoSlot>> slots,
    PhotoSlot tapped,
    PhotoPermissions perms,
  ) {
    final entries = <ViewerPhoto>[];
    var initial = 0;
    for (final state in PhotoState.values) {
      final list = slots[state]!;
      for (var i = 0; i < list.length; i++) {
        final slot = list[i];
        // Ko'rish huquqi bo'lmasa — faqat o'zi olgan, hali yuklanmagan rasm.
        if (slot.photo != null && !perms.canView) continue;
        if (identical(slot, tapped)) initial = entries.length;
        entries.add(ViewerPhoto(
          heroTag: _heroTag(slot),
          state: state,
          index: i + 1,
          total: list.length,
          url: slot.url,
          localPath: slot.op?.localPath != null && !(slot.op?.done ?? false) ? slot.op!.localPath : null,
          photo: slot.photo,
        ));
      }
    }
    if (entries.isEmpty) return;
    PhotoViewerPage.open(
      context,
      photos: entries,
      initialIndex: initial,
      subtitle: '$subId · ${live.name}',
      onDelete: perms.canDelete
          ? (p) async {
              final ok = await _confirmDelete(context);
              if (ok) {
                ref.read(photoQueueProvider.notifier).deletePhoto(
                      orderId: orderId,
                      itemId: live.id,
                      state: p.state,
                      fileId: p.photo!.fileId,
                      label: "${_label(live, p.state)} o'chirildi",
                    );
              }
              return ok;
            }
          : null,
    );
  }

  Future<void> _remove(BuildContext context, WidgetRef ref, OrderItem live, PhotoSlot slot) async {
    final queue = ref.read(photoQueueProvider.notifier);
    final op = slot.op;
    if (op != null && !op.done) {
      await queue.cancel(op.id);
      return;
    }
    final fileId = slot.photo?.fileId ?? op?.fileId;
    if (fileId == null || !await _confirmDelete(context)) return;
    queue.deletePhoto(
      orderId: orderId,
      itemId: live.id,
      state: slot.state,
      fileId: fileId,
      label: "${_label(live, slot.state)} o'chirildi",
    );
  }

  static Future<bool> _confirmDelete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Rasmni o'chirasizmi?"),
        content: const Text("Rasm barcha xodimlar uchun o'chadi va qayta tiklanmaydi."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Yo'q")),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text("O'chirish"),
          ),
        ],
      ),
    );
    return ok == true;
  }
}

String _heroTag(PhotoSlot slot) => 'photo-${slot.photo?.fileId ?? slot.op?.fileId ?? slot.op?.id}';

class _StateSection extends StatelessWidget {
  final PhotoState state;
  final List<PhotoSlot> slots;
  final PhotoPermissions perms;
  final bool online;
  final VoidCallback onAdd;
  final ValueChanged<PhotoSlot> onOpen;
  final ValueChanged<PhotoSlot> onRemove;

  const _StateSection({
    required this.state,
    required this.slots,
    required this.perms,
    required this.online,
    required this.onAdd,
    required this.onOpen,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final color = state == PhotoState.before ? AppColors.warning : AppColors.success;
    final tiles = <Widget>[
      for (final slot in slots.take(kMaxPhotosPerState))
        _PhotoTile(
          slot: slot,
          canView: perms.canView,
          canDelete: perms.canDelete,
          online: online,
          onOpen: () => onOpen(slot),
          onRemove: () => onRemove(slot),
        ),
    ];
    while (tiles.length < kMaxPhotosPerState) {
      final first = tiles.length == slots.length;
      tiles.add(perms.canUpload && first ? _AddTile(onTap: onAdd) : const _EmptyTile());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(state == PhotoState.before ? Icons.history_rounded : Icons.verified_rounded, size: 18, color: color),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                state.title,
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
              child: Text(
                '${slots.length}/$kMaxPhotosPerState',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: color),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(left: 24, top: 1, bottom: 8),
          child: Text(
            state == PhotoState.before ? "Qabul qilingandagi holati (dog', yirtiq, kamchiliklar)" : 'Yuvilib, tayyor bo\'lgandagi holati',
            style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark),
          ),
        ),
        Row(
          children: [
            for (var i = 0; i < tiles.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(child: AspectRatio(aspectRatio: 1, child: tiles[i])),
            ],
          ],
        ),
      ],
    );
  }
}

class _PhotoTile extends StatelessWidget {
  final PhotoSlot slot;
  final bool canView;
  final bool canDelete;
  final bool online;
  final VoidCallback onOpen;
  final VoidCallback onRemove;

  const _PhotoTile({
    required this.slot,
    required this.canView,
    required this.canDelete,
    required this.online,
    required this.onOpen,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final op = slot.op;
    final pending = op != null && !op.done;
    // Serverdagi rasm, ko'rish huquqisiz: faqat "rasm bor" belgisi.
    final locked = !pending && !canView;
    final localPath = pending ? op.localPath : null;

    final Widget image = locked
        ? const _LockedFace()
        : localPath != null
            ? LocalPhotoImage(path: localPath)
            : slot.url != null
                ? PhotoImage(url: slot.url!)
                : const PhotoPlaceholder();

    // Navbatdagi rasmni bekor qilish — doim; serverdagini o'chirish — vakolat bilan.
    final removable = pending ? !op.sending : canDelete;

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Material(
        color: AppColors.bg,
        child: InkWell(
          onTap: locked ? null : onOpen,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Hero(tag: _heroTag(slot), child: image),
              if (pending) _PendingScrim(op: op, online: online),
              if (removable)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Material(
                    color: Colors.black.withValues(alpha: 0.55),
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: onRemove,
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Icon(
                          pending ? Icons.close_rounded : Icons.delete_outline_rounded,
                          size: 17,
                          color: Colors.white,
                          semanticLabel: pending ? 'Bekor qilish' : "O'chirish",
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingScrim extends StatelessWidget {
  final PhotoOp op;
  final bool online;
  const _PendingScrim({required this.op, required this.online});

  @override
  Widget build(BuildContext context) {
    final (Widget icon, String text, Color color) = op.failed
        ? (const Icon(Icons.error_outline_rounded, color: Colors.white, size: 22), 'Yuklanmadi', AppColors.danger)
        : op.sending
            ? (
                const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)),
                'Yuklanmoqda',
                Colors.black,
              )
            : !online
                ? (const Icon(Icons.cloud_off_rounded, color: Colors.white, size: 22), 'Internet kutilmoqda', Colors.black)
                : (const Icon(Icons.schedule_rounded, color: Colors.white, size: 22), 'Navbatda', Colors.black);
    return ColoredBox(
      color: color.withValues(alpha: op.failed ? 0.55 : 0.38),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              icon,
              const SizedBox(height: 6),
              Text(
                text,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LockedFace extends StatelessWidget {
  const _LockedFace();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.bg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline_rounded, color: AppColors.grayDark, size: 22),
            SizedBox(height: 4),
            Text('Rasm bor', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.grayDark)),
          ],
        ),
      ),
    );
  }
}

class _AddTile extends StatelessWidget {
  final VoidCallback onTap;
  const _AddTile({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primary.withValues(alpha: 0.05),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.primary.withValues(alpha: 0.35), width: 1.4),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: const Center(
          child: Padding(
            padding: EdgeInsets.all(8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.add_a_photo_rounded, color: AppColors.primary, size: 26),
                SizedBox(height: 6),
                Text(
                  "Rasm qo'shish",
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.primary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyTile extends StatelessWidget {
  const _EmptyTile();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: const Center(
        child: Icon(Icons.image_not_supported_outlined, color: AppColors.gray, size: 24),
      ),
    );
  }
}

class _SourceButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _SourceButton({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primary.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 8),
          child: Column(
            children: [
              Icon(icon, color: AppColors.primary, size: 30),
              const SizedBox(height: 8),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
            ],
          ),
        ),
      ),
    );
  }
}

class _FailedOpTile extends ConsumerWidget {
  final PhotoOp op;
  const _FailedOpTile({required this.op});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.read(photoQueueProvider.notifier);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            op.isUpload ? '${op.state.title}: rasm yuklanmadi' : "${op.state.title}: rasm o'chirilmadi",
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          if (op.error != null) ...[
            const SizedBox(height: 4),
            Text(op.error!, style: const TextStyle(fontSize: 12.5, color: AppColors.danger, height: 1.35)),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => queue.cancel(op.id),
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                  child: const Text('Bekor qilish'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(onPressed: () => queue.retry(op.id), child: const Text('Qayta urinish')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

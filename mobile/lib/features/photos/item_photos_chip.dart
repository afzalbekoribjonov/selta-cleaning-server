import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/item_photo.dart';
import '../../core/models/order_item.dart';
import '../../core/photos/photo_queue.dart';
import '../../core/photos/photo_services.dart';
import 'item_photos_sheet.dart';

/// Mahsulot qatoridagi rasmlar belgisi: "Eski 2 · Tayyor 1" yoki
/// "Rasm qo'shish". Vakolat bo'lmasa umuman ko'rinmaydi. Rasmlarning
/// o'zi bu yerda yuklanmaydi — faqat oyna ochilganda (trafik tejaladi).
class ItemPhotosChip extends ConsumerWidget {
  final String orderId;
  final OrderItem item;
  final String subId;

  const ItemPhotosChip({super.key, required this.orderId, required this.item, required this.subId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final perms = ref.watch(photoPermissionsProvider);
    if (!perms.any) return const SizedBox.shrink();
    final ops = ref.watch(photoQueueProvider);

    final before = photoSlotsOf(orderId, item, PhotoState.before, ops);
    final ready = photoSlotsOf(orderId, item, PhotoState.ready, ops);
    final total = before.length + ready.length;
    if (total == 0 && !perms.canUpload) return const SizedBox.shrink();

    final mine = [...before, ...ready].map((s) => s.op).whereType<PhotoOp>();
    final failed = mine.any((o) => o.failed);
    final waiting = mine.any((o) => !o.done && !o.failed);

    final label = total == 0
        ? "Rasm qo'shish"
        : [
            if (before.isNotEmpty) 'Eski ${before.length}',
            if (ready.isNotEmpty) 'Tayyor ${ready.length}',
          ].join(' · ');
    final color = failed ? AppColors.danger : AppColors.info;

    return Semantics(
      button: true,
      label: total == 0 ? "Rasm qo'shish" : 'Rasmlar: $label',
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => showItemPhotosSheet(context, orderId: orderId, item: item, subId: subId),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: total == 0 ? Colors.transparent : color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
            border: total == 0 ? Border.all(color: color.withValues(alpha: 0.45)) : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                failed
                    ? Icons.error_outline_rounded
                    : waiting
                        ? Icons.cloud_upload_rounded
                        : total == 0
                            ? Icons.add_a_photo_outlined
                            : Icons.photo_camera_rounded,
                size: 12,
                color: color,
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../services/auth_service.dart';
import '../sync/action_queue.dart';

/// Barcha bo'lim panellarida bir xil — "Chiqish" tugmasi bosilganda
/// tasdiqlash so'raydi, keyin sessiyani tugatadi.
///
/// Serverga hali yetmagan amallar bo'lsa, bu alohida aytiladi: ular
/// shu xodimning navbatida qoladi va u QAYTA KIRGANDA yuboriladi (boshqa
/// xodim nomidan yuborilmaydi). Xodim buni bilmasa, ishim saqlanmadi deb
/// o'ylab qolishi mumkin edi.
Future<void> confirmLogout(BuildContext context, WidgetRef ref) async {
  final pending = ref.read(pendingActionCountProvider) + ref.read(failedActionsProvider).length;

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Chiqishni tasdiqlang'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Tizimdan chiqmoqchimisiz?'),
          if (pending > 0) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.cloud_upload_rounded, size: 18, color: AppColors.warning),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      "$pending ta amal hali serverga yuborilmagan. Ular yo'qolmaydi — "
                      'siz qayta kirganingizda avtomatik yuboriladi.',
                      style: const TextStyle(fontSize: 12.5, height: 1.35, color: AppColors.ink),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor qilish')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Chiqish')),
      ],
    ),
  );

  if (confirmed == true) {
    await ref.read(authServiceProvider).logout();
    if (context.mounted) context.go('/select');
  }
}

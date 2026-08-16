import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../services/auth_service.dart';

/// Barcha bo'lim panellarida bir xil — "Chiqish" tugmasi bosilganda
/// tasdiqlash so'raydi, keyin sessiyani tugatadi.
Future<void> confirmLogout(BuildContext context, WidgetRef ref) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Chiqishni tasdiqlang'),
      content: const Text('Tizimdan chiqmoqchimisiz?'),
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

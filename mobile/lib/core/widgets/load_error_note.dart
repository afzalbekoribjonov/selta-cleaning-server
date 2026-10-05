import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../services/api_client.dart';
import '../services/order_items_provider.dart' show ItemsUnavailableOffline;

/// Ma'lumot yuklanmaganining xodimga tushunarli sababi — xom xato matni
/// ("Xatolik: [cloud_firestore/unavailable] ...") o'rniga.
String describeLoadError(Object error) {
  if (error is ItemsUnavailableOffline) return error.toString();
  if (error is ApiException) return error.message;
  if (error is FirebaseException) {
    switch (error.code) {
      case 'unavailable':
      case 'deadline-exceeded':
        return "Internet yo'q — ma'lumot hali yuklanmagan";
      case 'permission-denied':
        return "Bu ma'lumotni ko'rishga ruxsat yo'q";
    }
  }
  return "Ma'lumotni yuklab bo'lmadi";
}

/// Yuklash xatosi — ikonka, tushunarli matn va (berilsa) "Qayta urinish".
class LoadErrorNote extends StatelessWidget {
  final Object error;
  final VoidCallback? onRetry;
  final bool centered;

  const LoadErrorNote({super.key, required this.error, this.onRetry, this.centered = false});

  @override
  Widget build(BuildContext context) {
    final offline = error is ItemsUnavailableOffline ||
        (error is FirebaseException && (error as FirebaseException).code == 'unavailable');
    final note = Row(
      mainAxisSize: centered ? MainAxisSize.min : MainAxisSize.max,
      children: [
        Icon(offline ? Icons.cloud_off_rounded : Icons.error_outline_rounded, size: 18, color: AppColors.grayDark),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            describeLoadError(error),
            style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
          ),
        ),
        if (onRetry != null)
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
            child: const Text('Qayta urinish'),
          ),
      ],
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: centered ? Center(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: note)) : note,
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/order_item.dart';
import '../../core/widgets/load_error_note.dart';

/// Mahsulotlar ro'yxati hali kelmagan bo'lsa — kartaning ichida ko'rsatiladigan
/// holat (yuklanish chizig'i yoki xato); ro'yxat tayyor bo'lsa `null`.
///
/// Kartaning sarlavhasi va "Qo'shish" tugmasi esa HAR DOIM ko'rinadi:
/// mahsulot qo'shish ro'yxat yuklanishini kutmaydi (navbat orqali ketadi,
/// raqamni server beradi). Avval tugma faqat ro'yxat kelgandan keyin
/// chiqardi va ro'yxat kelmay qolsa xodim ishini davom ettira olmasdi.
Widget? itemsPendingNote(AsyncValue<List<OrderItem>> items) {
  if (items.hasValue) return null;
  if (items.hasError) {
    return Padding(padding: const EdgeInsets.only(top: 6), child: LoadErrorNote(error: items.error!));
  }
  return const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: LinearProgressIndicator());
}

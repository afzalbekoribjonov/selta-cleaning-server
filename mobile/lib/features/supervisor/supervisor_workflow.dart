import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/supervisor_repository.dart';

/// Nazoratchi kuzatadigan mahsulot bosqichlari (sexdagi ish).
class WorkflowStage {
  final String key;
  final String label;
  final IconData icon;
  final Color color;

  const WorkflowStage(this.key, this.label, this.icon, this.color);
}

const kWorkflowStages = [
  WorkflowStage('pending', 'Navbatda', Icons.hourglass_empty_rounded, AppColors.grayDark),
  WorkflowStage('washing', 'Yuvilmoqda', Icons.local_laundry_service_rounded, AppColors.info),
  WorkflowStage('packing', 'Upakovka', Icons.inventory_rounded, Color(0xFFB7791F)),
  WorkflowStage('returned', 'Qaytarilgan', Icons.replay_rounded, AppColors.danger),
  WorkflowStage('ready', 'Tayyor', Icons.check_circle_rounded, AppColors.success),
];

/// Bosqichdagi amal — nazoratchi uni tanlangan ishchi NOMIDAN qayd etadi.
class StageAction {
  final String toStatus;
  final String label;

  /// Tanlash oynasidagi savol: "Kim yuvadi?", "Kim upakovka qildi?".
  final String question;
  final IconData icon;

  /// Upakovka huquqi kerak (aks holda — yuvish mutaxassisligi).
  final bool packing;

  /// Qaytarish sababi majburiy.
  final bool needsNote;
  final bool destructive;

  const StageAction({
    required this.toStatus,
    required this.label,
    required this.question,
    required this.icon,
    this.packing = false,
    this.needsNote = false,
    this.destructive = false,
  });
}

/// Har bir bosqichdan qaysi amallar mumkin (server: ITEM_MANUAL_TRANSITIONS).
/// "Tayyor"dan keyingisi — mijozga topshirish, dastavchik ishi.
const kStageActions = <String, List<StageAction>>{
  'pending': [
    StageAction(toStatus: 'washing', label: 'Yuvishga berish', question: 'Kim yuvadi?', icon: Icons.local_laundry_service_rounded),
  ],
  'washing': [
    StageAction(toStatus: 'packing', label: 'Yuvildi', question: 'Kim yuvdi?', icon: Icons.water_drop_rounded),
  ],
  'packing': [
    StageAction(toStatus: 'ready', label: 'Tayyor', question: 'Kim upakovka qildi?', icon: Icons.verified_rounded, packing: true),
    StageAction(
      toStatus: 'returned',
      label: 'Qaytarish',
      question: 'Kim tekshirdi?',
      icon: Icons.replay_rounded,
      packing: true,
      needsNote: true,
      destructive: true,
    ),
  ],
  'returned': [
    StageAction(toStatus: 'washing', label: 'Qayta yuvish', question: 'Kim qayta yuvadi?', icon: Icons.restart_alt_rounded),
  ],
};

/// Sexdagi bitta mahsulot va uning buyurtmasi.
class WorkItem {
  final Order order;
  final OrderItem item;
  const WorkItem(this.order, this.item);

  String get subId => item.subId(order.orderNumber);
}

/// Bosqichdagi mahsulotlar — faol buyurtmalardagi mahsulotlar nusxasidan
/// (qo'shimcha o'qishsiz). Eng eski buyurtma birinchi (navbat tartibi).
List<WorkItem> itemsInStage(List<Order> orders, String stage) {
  final list = <WorkItem>[];
  for (final o in orders) {
    if (o.serviceType != 'pickup' || o.status != 'brought_in') continue;
    if ((o.itemStatusCounts[stage] ?? 0) == 0) continue;
    for (final i in o.itemsMirror ?? const <OrderItem>[]) {
      if (i.status == stage) list.add(WorkItem(o, i));
    }
  }
  list.sort((a, b) {
    final byOrder = a.order.createdAt.compareTo(b.order.createdAt);
    return byOrder != 0 ? byOrder : a.item.itemNumber.compareTo(b.item.itemNumber);
  });
  return list;
}

/// Bosqichlar bo'yicha mahsulotlar soni — buyurtma xulosasidan.
Map<String, int> stageCounts(List<Order> orders) {
  final counts = {for (final s in kWorkflowStages) s.key: 0};
  for (final o in orders) {
    if (o.serviceType != 'pickup' || o.status != 'brought_in') continue;
    for (final s in kWorkflowStages) {
      counts[s.key] = counts[s.key]! + (o.itemStatusCounts[s.key] ?? 0);
    }
  }
  return counts;
}

/// Ishchi bu ishni bajara oladimi — server qoidasi bilan bir xil
/// (routes/orders.ts assertWorkerLavozim). `null` — mumkin; aks holda sabab.
String? ineligibilityReason(StaffMember worker, OrderItem item, StageAction action) {
  if (!worker.isWorker) return 'Ishchi emas';
  if (action.packing) {
    return worker.canPack ? null : 'Upakovka huquqi yo\'q';
  }
  if (worker.specializations.isEmpty) return 'Mutaxassislik belgilanmagan';
  final category = item.category;
  if (category != null && category.isNotEmpty && category != '_none' && !worker.specializations.contains(category)) {
    return 'Mutaxassisligi mos emas';
  }
  return null;
}

/// Oynada oldindan tanlangan ishchi: "Yuvildi"da — yuvishni boshlagan.
String? defaultPerformerFor(OrderItem item, StageAction action) {
  if (action.toStatus == 'packing') return item.washingBy;
  return null;
}

/// Qidiruv so'zi buyurtmaga mos keladimi: mijoz ismi, manzil, raqam
/// ("#12", "12" yoki "12/3") yoki telefon raqamining bir qismi (kamida
/// 3 ta raqam — "1" kabi bitta raqam deyarli hamma telefonga mos kelardi).
/// [query] kichik harflarda, bo'shliqlari olib tashlangan bo'lishi kerak.
bool orderMatchesQuery(Order o, String query) {
  if (query.isEmpty) return true;
  if (o.customerName.toLowerCase().contains(query) || o.location.toLowerCase().contains(query)) return true;
  final number = query.replaceFirst('#', '');
  if (number.isNotEmpty && RegExp(r'^\d+(/\d+)?$').hasMatch(number)) {
    final head = number.split('/').first;
    if ('${o.orderNumber}' == head) return true;
  }
  final digits = query.replaceAll(RegExp(r'\D'), '');
  return digits.length >= 3 && o.phone.replaceAll(RegExp(r'\D'), '').contains(digits);
}

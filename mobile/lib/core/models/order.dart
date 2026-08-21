import 'package:cloud_firestore/cloud_firestore.dart';

class Order {
  final String id;
  final int orderNumber;
  final String customerName;
  final String phone;
  final String location;
  final String? gpsCoords;
  final String serviceType; // 'pickup' | 'onsite'
  // Faqat onsite buyurtmalarda mavjud — pickup'da tarif item-darajasiga
  // ko'chirildi (har bir OrderItem.tariff'ga qarang).
  final String? tariff; // 'express' | 'comfort' | 'standart' | 'premium'
  final String status;
  final List<String> assignedTeam;
  final num totalArea;
  final num totalPrice;
  final String createdBy;
  final String? washedBy;
  final String? deliveredBy;
  final String? qcRatedBy;
  // Pickup buyurtmalarda yuvish/yetkazish item-darajasida (har xil item
  // turli xodimga tegishli bo'lishi mumkin) — shu massivlar statistika/
  // faollik so'rovlari uchun (changeItemStatus: arrayUnion).
  final List<String> washedByEmployees;
  final List<String> deliveredByEmployees;
  final List<String> deliveryAddedByEmployees;
  final DateTime createdAt;
  final DateTime? dueDate;
  final int? qcRating;
  final String? qcRatingNote;
  // Faqat onsite buyurtmalarda — sotuv menejeri buyurtma yaratishda
  // ixtiyoriy ravishda mijoz aytgan mahsulot nomlarini va taxminiy
  // summani yozib qo'yishi mumkin (majburiy emas). Jamoa mijoz uyida
  // haqiqiy mahsulotlarni aniqlashtirib qo'shguncha shu qaydlar
  // ma'lumot uchun ko'rsatiladi.
  final List<String> notedItems;
  final num? estimatedPrice;

  const Order({
    required this.id,
    required this.orderNumber,
    required this.customerName,
    required this.phone,
    required this.location,
    this.gpsCoords,
    required this.serviceType,
    this.tariff,
    required this.status,
    this.assignedTeam = const [],
    this.totalArea = 0,
    this.totalPrice = 0,
    required this.createdBy,
    this.washedBy,
    this.deliveredBy,
    this.qcRatedBy,
    this.washedByEmployees = const [],
    this.deliveredByEmployees = const [],
    this.deliveryAddedByEmployees = const [],
    required this.createdAt,
    this.dueDate,
    this.qcRating,
    this.qcRatingNote,
    this.notedItems = const [],
    this.estimatedPrice,
  });

  factory Order.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return Order(
      id: doc.id,
      orderNumber: (data['orderNumber'] as num?)?.toInt() ?? 0,
      customerName: data['customerName']?.toString() ?? '',
      phone: data['phone']?.toString() ?? '',
      location: data['location']?.toString() ?? '',
      gpsCoords: data['gpsCoords']?.toString(),
      serviceType: data['serviceType']?.toString() ?? 'pickup',
      tariff: data['tariff']?.toString(),
      status: data['status']?.toString() ?? 'new',
      assignedTeam: (data['assignedTeam'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      totalArea: (data['totalArea'] as num?) ?? 0,
      totalPrice: (data['totalPrice'] as num?) ?? 0,
      createdBy: data['createdBy']?.toString() ?? '',
      washedBy: data['washedBy']?.toString(),
      deliveredBy: data['deliveredBy']?.toString(),
      qcRatedBy: data['qcRatedBy']?.toString(),
      washedByEmployees: (data['washedByEmployees'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      deliveredByEmployees: (data['deliveredByEmployees'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      deliveryAddedByEmployees: (data['deliveryAddedByEmployees'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      dueDate: (data['dueDate'] as Timestamp?)?.toDate(),
      qcRating: (data['qcRating'] as num?)?.toInt(),
      qcRatingNote: data['qcRatingNote']?.toString(),
      notedItems: (data['notedItems'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      estimatedPrice: data['estimatedPrice'] as num?,
    );
  }

  bool get isDone => status == 'done';

  bool get isOverdue {
    if (dueDate == null || isDone) return false;
    return DateTime.now().isAfter(dueDate!);
  }
}

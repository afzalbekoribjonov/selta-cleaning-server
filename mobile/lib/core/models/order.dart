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
  final String? pickedUpBy;
  final DateTime? pickedUpAt;
  // Faqat ko'rsatish uchun (server: changeOrderStatus) — haqiqiy
  // hisobdorlik har doim `pickedUpBy` (employeeId)dan.
  final String? pickedUpByName;
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
  /// --- Mahsulotlardan HOSILA (server: lib/orderSummary.ts) ---
  /// Pickup buyurtmalarda tarif/muddat ITEM darajasida. Avval har bir
  /// karta buni ko'rsatish uchun o'z `items` obunasini ochardi — ro'yxatda
  /// yuzlab karta bo'lganda bu Firestore kunlik limitini tugatib qo'ydi.
  /// Endi server bu qiymatlarni mahsulot o'zgarganda buyurtmaga yozadi.
  final List<String> itemTariffs;
  final DateTime? earliestPendingDueDate;
  final int zeroPriceItemCount;
  final Map<String, int> itemStatusCounts;
  final Map<String, List<String>> itemStageCategories;
  final List<String> notedItems;
  final num? estimatedPrice;
  // Talab: marketing statistikasi — sotuv menejeri buyurtma yaratishda
  // ixtiyoriy ravishda tanlaydi (masalan 'instagram', 'telegram').
  final String? source;
  // Talab: "O'zi keldi" — mijoz do'konga o'zi kelganda buyurtma
  // yaratilgan bo'lsa 'walk_in', aks holda null (odatiy olib kelish).
  final String? intakeMethod;

  /// Bu buyurtmada serverga hali yetib bormagan (navbatdagi) o'zgarish bor.
  /// Firestore'da YO'Q maydon — faqat ilova ichida, oflayn navbat
  /// (core/sync) ekranga qo'yadi. Kartada kichik belgi bilan ko'rsatiladi.
  final bool pendingSync;

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
    this.pickedUpBy,
    this.pickedUpAt,
    this.pickedUpByName,
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
    this.itemTariffs = const [],
    this.earliestPendingDueDate,
    this.zeroPriceItemCount = 0,
    this.itemStatusCounts = const {},
    this.itemStageCategories = const {},
    this.notedItems = const [],
    this.estimatedPrice,
    this.source,
    this.intakeMethod,
    this.pendingSync = false,
  });

  /// Oflayn yaratilgan buyurtma hali serverga yetmagan — raqami yo'q.
  bool get awaitingNumber => orderNumber <= 0;

  /// "#1245" — raqam hali berilmagan bo'lsa "#…" ("#0" ko'rinmasligi uchun).
  String get displayNumber => awaitingNumber ? '#…' : '#$orderNumber';

  Order copyWith({
    int? orderNumber,
    String? customerName,
    String? phone,
    String? location,
    String? gpsCoords,
    String? tariff,
    String? status,
    List<String>? assignedTeam,
    num? totalArea,
    num? totalPrice,
    String? pickedUpBy,
    DateTime? pickedUpAt,
    String? pickedUpByName,
    List<String>? deliveredByEmployees,
    DateTime? dueDate,
    int? qcRating,
    List<String>? itemTariffs,
    DateTime? earliestPendingDueDate,
    int? zeroPriceItemCount,
    Map<String, int>? itemStatusCounts,
    Map<String, List<String>>? itemStageCategories,
    List<String>? notedItems,
    num? estimatedPrice,
    String? source,
    String? intakeMethod,
    bool? pendingSync,
  }) {
    return Order(
      id: id,
      orderNumber: orderNumber ?? this.orderNumber,
      customerName: customerName ?? this.customerName,
      phone: phone ?? this.phone,
      location: location ?? this.location,
      gpsCoords: gpsCoords ?? this.gpsCoords,
      serviceType: serviceType,
      tariff: tariff ?? this.tariff,
      status: status ?? this.status,
      assignedTeam: assignedTeam ?? this.assignedTeam,
      totalArea: totalArea ?? this.totalArea,
      totalPrice: totalPrice ?? this.totalPrice,
      createdBy: createdBy,
      pickedUpBy: pickedUpBy ?? this.pickedUpBy,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
      pickedUpByName: pickedUpByName ?? this.pickedUpByName,
      washedBy: washedBy,
      deliveredBy: deliveredBy,
      qcRatedBy: qcRatedBy,
      washedByEmployees: washedByEmployees,
      deliveredByEmployees: deliveredByEmployees ?? this.deliveredByEmployees,
      deliveryAddedByEmployees: deliveryAddedByEmployees,
      createdAt: createdAt,
      dueDate: dueDate ?? this.dueDate,
      qcRating: qcRating ?? this.qcRating,
      qcRatingNote: qcRatingNote,
      itemTariffs: itemTariffs ?? this.itemTariffs,
      earliestPendingDueDate: earliestPendingDueDate ?? this.earliestPendingDueDate,
      zeroPriceItemCount: zeroPriceItemCount ?? this.zeroPriceItemCount,
      itemStatusCounts: itemStatusCounts ?? this.itemStatusCounts,
      itemStageCategories: itemStageCategories ?? this.itemStageCategories,
      notedItems: notedItems ?? this.notedItems,
      estimatedPrice: estimatedPrice ?? this.estimatedPrice,
      source: source ?? this.source,
      intakeMethod: intakeMethod ?? this.intakeMethod,
      pendingSync: pendingSync ?? this.pendingSync,
    );
  }

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
      pickedUpBy: data['pickedUpBy']?.toString(),
      pickedUpAt: (data['pickedUpAt'] as Timestamp?)?.toDate(),
      pickedUpByName: data['pickedUpByName']?.toString(),
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
      itemTariffs: (data['itemTariffs'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      earliestPendingDueDate: (data['earliestPendingDueDate'] as Timestamp?)?.toDate(),
      zeroPriceItemCount: (data['zeroPriceItemCount'] as num?)?.toInt() ?? 0,
      itemStatusCounts: (data['itemStatusCounts'] as Map?)
              ?.map((k, v) => MapEntry(k.toString(), (v as num).toInt())) ??
          const {},
      itemStageCategories: (data['itemStageCategories'] as Map?)?.map(
            (k, v) => MapEntry(k.toString(), (v as List?)?.map((e) => e.toString()).toList() ?? const <String>[]),
          ) ??
          const {},
      notedItems: (data['notedItems'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      estimatedPrice: data['estimatedPrice'] as num?,
      source: data['source']?.toString(),
      intakeMethod: data['intakeMethod']?.toString(),
    );
  }

  bool get isDone => status == 'done';

  bool get isOverdue {
    if (dueDate == null || isDone) return false;
    return DateTime.now().isAfter(dueDate!);
  }
}

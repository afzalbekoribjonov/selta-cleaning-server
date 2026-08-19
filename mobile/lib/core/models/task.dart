import 'package:cloud_firestore/cloud_firestore.dart';

/// "Boshqa" bo'limdagi xodimlarga admin tayinlaydigan topshiriq — ikki tur:
///  - 'single': oxirgi sanali bitta vazifa (Bajarildi / Kechikmoqdaman).
///  - 'monthly': bir oy ichida aniq kunga tayinlangan mustaqil topshiriq
///    (faqat Bajarildi).
class Task {
  final String id;
  final String type; // 'single' | 'monthly'
  final String title;
  final String? description;
  final DateTime? dueDate;
  final DateTime? scheduledDate;
  final String status; // 'pending' | 'done' | 'delayed'
  final String? delayNote;
  final DateTime? completedAt;
  final DateTime createdAt;

  const Task({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    this.dueDate,
    this.scheduledDate,
    required this.status,
    this.delayNote,
    this.completedAt,
    required this.createdAt,
  });

  bool get isSingle => type == 'single';
  bool get isPending => status == 'pending';
  bool get isDone => status == 'done';
  bool get isDelayed => status == 'delayed';
  bool get isOverdue => isPending && dueDate != null && DateTime.now().isAfter(dueDate!);

  factory Task.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return Task(
      id: doc.id,
      type: data['type']?.toString() ?? 'single',
      title: data['title']?.toString() ?? '',
      description: data['description']?.toString(),
      dueDate: (data['dueDate'] as Timestamp?)?.toDate(),
      scheduledDate: (data['scheduledDate'] as Timestamp?)?.toDate(),
      status: data['status']?.toString() ?? 'pending',
      delayNote: data['delayNote']?.toString(),
      completedAt: (data['completedAt'] as Timestamp?)?.toDate(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}

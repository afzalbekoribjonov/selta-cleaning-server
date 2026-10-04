import 'dart:math';

/// Serverga hali yetib bormagan amal — oflayn navbatning bitta yozuvi.
///
/// Amal ikki qismdan iborat:
///  - [path] + [body] — serverga aynan nima yuboriladi (body ichida
///    `actionId` bor: server shu bo'yicha takroriy so'rovni taniydi);
///  - [effect] — amal ekranda QANDAY ko'rinishi kerak (core/sync/overlay.dart).
///    Server javobini kutmasdan ilova shu bo'yicha ma'lumotni darhol
///    o'zgartirib ko'rsatadi.
///
/// Hamma maydon JSON'ga aylanadi: navbat qurilmada saqlanadi va ilova
/// yopilib qayta ochilsa ham yo'qolmaydi.
class PendingAction {
  final String id;
  final String path;
  final Map<String, dynamic> body;

  /// Amal tegishli buyurtma — ekranda o'zgarishni qo'llash uchun.
  final String? orderId;

  /// Ekrandagi ta'sir: `{'kind': ..., ...}` (overlay.dart'dagi turlar).
  final Map<String, dynamic> effect;

  /// Xodimga ko'rsatiladigan tavsif: "#1245 · Gilam — upakovkaga".
  final String label;

  final DateTime createdAt;

  /// Server rad etgan — avtomatik qayta yuborilmaydi, xodim qaror qiladi.
  final bool failed;
  final String? error;

  /// Server qabul qildi; Firestore yangilanishi yetib kelguncha ekrandagi
  /// ta'sir qisqa muddat saqlanadi (aks holda bir lahza eski holat
  /// ko'rinib "o'zgarish bekor bo'ldimi?" degan taassurot qoldirardi).
  final bool acked;

  final int attempts;

  const PendingAction({
    required this.id,
    required this.path,
    required this.body,
    required this.effect,
    required this.label,
    required this.createdAt,
    this.orderId,
    this.failed = false,
    this.error,
    this.acked = false,
    this.attempts = 0,
  });

  String get kind => effect['kind'] as String? ?? 'none';

  PendingAction copyWith({bool? failed, String? error, bool? acked, int? attempts, bool clearError = false}) {
    return PendingAction(
      id: id,
      path: path,
      body: body,
      effect: effect,
      label: label,
      createdAt: createdAt,
      orderId: orderId,
      failed: failed ?? this.failed,
      error: clearError ? null : (error ?? this.error),
      acked: acked ?? this.acked,
      attempts: attempts ?? this.attempts,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'path': path,
        'body': body,
        'effect': effect,
        'label': label,
        'createdAt': createdAt.millisecondsSinceEpoch,
        if (orderId != null) 'orderId': orderId,
        if (failed) 'failed': true,
        if (error != null) 'error': error,
        'attempts': attempts,
        // `acked` ataylab SAQLANMAYDI: ilova qayta ochilganda bunday amal
        // yana yuboriladi va server uni takror deb tanib, o'sha javobni
        // qaytaradi — ma'lumot yo'qolmaydi, ikki marta ham bajarilmaydi.
      };

  static PendingAction? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    final path = raw['path'];
    final body = raw['body'];
    final effect = raw['effect'];
    if (id is! String || path is! String || body is! Map || effect is! Map) return null;
    return PendingAction(
      id: id,
      path: path,
      body: Map<String, dynamic>.from(body),
      effect: Map<String, dynamic>.from(effect),
      label: raw['label']?.toString() ?? '',
      createdAt: DateTime.fromMillisecondsSinceEpoch((raw['createdAt'] as num?)?.toInt() ?? 0),
      orderId: raw['orderId'] as String?,
      failed: raw['failed'] == true,
      error: raw['error'] as String?,
      attempts: (raw['attempts'] as num?)?.toInt() ?? 0,
    );
  }
}

final _random = Random.secure();
const _alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/// Noyob amal ID'si — 20 belgi (~119 bit tasodif).
///
/// Server shu ID bo'yicha takroriy so'rovni taniydi (lib/idempotency.ts),
/// oflayn yaratilgan buyurtma va mahsulotlar esa aynan shu ID bilan
/// serverda paydo bo'ladi. Format serverdagi tekshiruvga mos:
/// 16-64 belgi, faqat `[A-Za-z0-9_-]`.
String newActionId() => List.generate(20, (_) => _alphabet[_random.nextInt(_alphabet.length)]).join();

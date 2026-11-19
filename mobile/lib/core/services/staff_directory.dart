import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart';
import 'local_store.dart';

/// Xodimlar ma'lumotnomasi — faqat ism va kasb (server: routes/staff.ts).
///
/// Buyurtma tarixida "kim yuvdi / qadoqladi / olib keldi", qayta yuvishga
/// qaytgan mahsulotni kim yuvgani va joyida yuvish jamoasi a'zolari shu
/// yerdan ko'rinadi. Xodimlar bir-birining hujjatini o'qiy olmaydi, shuning
/// uchun ro'yxat server orqali keladi va qurilmada saqlanadi: kuniga bir
/// marta so'raladi, internetsiz oxirgi nusxa ishlatiladi.
class StaffInfo {
  final String id;
  final String fullName;
  final String department;
  final String departmentLabel;
  final List<String> specializations;
  final bool canPack;
  final bool active;

  const StaffInfo({
    required this.id,
    required this.fullName,
    required this.department,
    required this.departmentLabel,
    this.specializations = const [],
    this.canPack = false,
    this.active = true,
  });

  factory StaffInfo.fromJson(Map<String, dynamic> j) => StaffInfo(
        id: j['id'] as String,
        fullName: j['fullName'] as String? ?? 'Xodim',
        department: j['department'] as String? ?? '',
        departmentLabel: j['departmentLabel'] as String? ?? '',
        specializations: (j['specializations'] as List?)?.map((e) => e.toString()).toList() ?? const [],
        canPack: j['canPack'] == true,
        active: j['active'] != false,
      );

  static const _categoryLabels = {'gilam': 'Gilam', 'parda': 'Parda', 'boshqa': 'Boshqa'};

  /// "Ishchi · Gilam, Parda" — kasbi va (ishchida) yuvadigan mahsulotlari.
  String get roleLine {
    final parts = <String>[if (departmentLabel.isNotEmpty) departmentLabel];
    if (department == 'worker') {
      final cats = specializations.map((s) => _categoryLabels[s] ?? s).toList();
      if (cats.isNotEmpty) parts.add(cats.join(', '));
      if (canPack) parts.add('upakovka');
    }
    return parts.join(' · ');
  }
}

const _cacheKey = 'cache.staffDirectory';

final staffDirectoryProvider = FutureProvider<Map<String, StaffInfo>>((ref) async {
  ref.watch(authStateProvider);
  final store = ref.read(localStoreProvider);
  final cached = store.getJson(_cacheKey);
  final savedAt = cached?['savedAt'];
  final data = cached?['data'];

  Map<String, StaffInfo> parse(Object? raw) {
    final list = raw is Map ? raw['employees'] : null;
    return {
      for (final e in (list is List ? list : const []))
        if (e is Map && e['id'] is String) e['id'] as String: StaffInfo.fromJson(Map<String, dynamic>.from(e)),
    };
  }

  // Bugun olingan nusxa bo'lsa — serverga so'rov yo'q.
  if (savedAt is num && data is Map) {
    final saved = DateTime.fromMillisecondsSinceEpoch(savedAt.toInt());
    final now = DateTime.now();
    if (saved.year == now.year && saved.month == now.month && saved.day == now.day) return parse(data);
  }

  try {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw StateError('Tizimga kirilmagan');
    final fresh = await ref.read(apiClientProvider).post('/staffDirectory', idToken: token, body: const {});
    await store.setJson(_cacheKey, {'savedAt': DateTime.now().millisecondsSinceEpoch, 'data': fresh});
    return parse(fresh);
  } catch (_) {
    // Internetsiz — eskirgan bo'lsa ham oxirgi nusxa (ismlar deyarli o'zgarmaydi).
    if (data is Map) return parse(data);
    rethrow;
  }
});

/// Ism (topilmasa null). Ro'yxat hali yuklanmagan bo'lsa ham xato bermaydi.
extension StaffNames on Map<String, StaffInfo>? {
  String? nameOf(String? id) => id == null ? null : this?[id]?.fullName;
}

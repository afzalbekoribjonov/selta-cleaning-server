import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/attendance_service.dart';
import '../services/auth_service.dart' show employeeClaimsProvider;
import '../services/employee_repository.dart';

/// Butun ilovani o'rab turadi (ConnectivityGate kabi). Ilova ochilganda
/// yoki fondan qaytganda — agar xodim davomat nazoratiga kiritilgan bo'lsa
/// va admin belgilagan vaqt oynasi ichida bo'lsa — joylashuvni sokin
/// tarzda (hech qanday interfeys, hech qanday xabar) serverga yuboradi.
/// Talab: "ilova ochilganda avtomatik" tekshiruv, "hech narsa
/// ko'rsatilmaydi". Hech narsa render qilmaydi — faqat side-effect.
class AttendanceGate extends ConsumerStatefulWidget {
  final Widget? child;
  const AttendanceGate({super.key, required this.child});

  @override
  ConsumerState<AttendanceGate> createState() => _AttendanceGateState();
}

class _AttendanceGateState extends ConsumerState<AttendanceGate> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _maybeCheckin();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _maybeCheckin();
    }
  }

  Future<void> _maybeCheckin() async {
    try {
      final claims = await ref.read(employeeClaimsProvider.future);
      if (claims == null) return;

      final employee = await ref.read(currentEmployeeProvider.future);
      if (employee?['attendanceEnabled'] != true) return;

      // Vaqt oynasi ATAYLAB bu yerda tekshirilmaydi — u faqat serverda
      // (biznes vaqti bo'yicha) aniqlanadi. Klient qurilma soatiga
      // tayanganda, telefon vaqt zonasi noto'g'ri bo'lsa xodim jimgina
      // "kelmagan" bo'lib qolardi. Servis o'zi kuniga bir marta muvaffaqiyatli
      // belgilagach to'xtaydi, shuning uchun bu qimmatga tushmaydi.
      final config = await ref.read(attendanceConfigProvider.future);
      if (!config.enabled) return;

      final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (idToken == null) return;

      await ref.read(attendanceServiceProvider).tryCheckin(idToken: idToken);
    } catch (_) {
      // Sokin — talab: hech qanday holatda ko'rinadigan ta'sir bo'lmasin.
    }
  }

  @override
  Widget build(BuildContext context) => widget.child ?? const SizedBox.shrink();
}

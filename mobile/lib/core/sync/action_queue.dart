import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart' show apiClientProvider, employeeClaimsProvider;
import '../services/connectivity_service.dart';
import '../services/local_store.dart';
import 'pending_action.dart';

/// Oflayn navbat — serverga yoziladigan BARCHA amallar shu yerdan o'tadi.
///
/// Ish tartibi:
///  1. Amal navbatga yoziladi (qurilmaga ham saqlanadi) va ekran DARHOL
///     o'zgaradi (overlay.dart). Xodim server javobini kutmaydi.
///  2. Navbat fonda, TARTIB BILAN serverga yuboriladi. Tartib muhim: bitta
///     mahsulotning "yuvildi -> upakovka -> tayyor" zanjiri aynan shu
///     ketma-ketlikda bajarilishi kerak.
///  3. Natija:
///     - qabul qilindi   -> qisqa muddatdan keyin navbatdan o'chadi;
///     - vaqtinchalik xato (internet yo'q, server uxlab yotibdi, 5xx) ->
///       navbat to'xtaydi va ortib boruvchi oraliq bilan qayta urinadi;
///     - rad etildi (4xx: masalan boshqa xodim allaqachon bajargan) ->
///       "bajarilmadi" deb belgilanadi, xodim qayta urinadi yoki bekor qiladi.
///
/// Navbat XODIMGA bog'langan: amal kim tomonidan yaratilgan bo'lsa,
/// faqat o'sha xodim tizimda bo'lganda (uning tokeni bilan) yuboriladi.
/// Aks holda boshqa xodimning amali yangi kirgan xodim nomidan
/// bajarilib ketardi.
class ActionQueue extends Notifier<List<PendingAction>> {
  /// Server qabul qilgandan keyin ta'sir ekranda shuncha turadi — Firestore
  /// yangilanishi yetib kelguncha bir lahza eski holat ko'rinmasligi uchun.
  static const _ackGrace = Duration(seconds: 6);

  /// Render bepul rejasida server "uyg'onishi" 60 soniyagacha cho'ziladi.
  static const _sendTimeout = Duration(seconds: 75);

  static const _backoff = [Duration(seconds: 3), Duration(seconds: 10), Duration(seconds: 30), Duration(seconds: 60)];

  /// Token muddati o'tgan bo'lsa server 401 qaytaradi va keyingi urinishda
  /// u yangilanadi. Shundan keyin ham 401 — xodim chiqarilgan/bloklangan.
  static const _maxAuthRetries = 5;

  String? _employeeId;
  bool _draining = false;
  Timer? _retryTimer;
  int _backoffStep = 0;
  final _ackTimers = <String, Timer>{};
  final _results = <String, Completer<Map<String, dynamic>?>>{};

  @override
  List<PendingAction> build() {
    _employeeId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;

    ref.onDispose(() {
      _retryTimer?.cancel();
      for (final t in _ackTimers.values) {
        t.cancel();
      }
      _ackTimers.clear();
    });

    // Internet qaytishi bilan kutmasdan yuboriladi.
    ref.listen<AsyncValue<bool>>(connectivityProvider, (prev, next) {
      if (next.valueOrNull == true && prev?.valueOrNull != true) {
        _backoffStep = 0;
        _scheduleDrain(Duration.zero);
      }
    });

    final loaded = _load();
    if (loaded.isNotEmpty) _scheduleDrain(Duration.zero);
    return loaded;
  }

  String _key(String employeeId) => 'outbox.v1.$employeeId';

  List<PendingAction> _load() {
    final id = _employeeId;
    if (id == null) return const [];
    final raw = ref.read(localStoreProvider).getString(_key(id));
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List).map(PendingAction.fromJson).whereType<PendingAction>().toList();
    } catch (_) {
      return const [];
    }
  }

  void _set(List<PendingAction> next) {
    state = next;
    final id = _employeeId;
    if (id == null) return;
    // Qabul qilinganlari saqlanmaydi: ilova shu lahzada yopilsa, ular
    // keyingi ochilishda shunchaki yo'qoladi — server ularni allaqachon
    // bajargan.
    final persistable = [for (final a in next) if (!a.acked) a.toJson()];
    final store = ref.read(localStoreProvider);
    if (persistable.isEmpty) {
      store.remove(_key(id));
    } else {
      store.setString(_key(id), jsonEncode(persistable));
    }
  }

  /// Amalni navbatga qo'yadi va darhol yuborishga harakat qiladi.
  void enqueue(PendingAction action) {
    _set([...state, action]);
    _backoffStep = 0;
    _scheduleDrain(Duration.zero);
  }

  /// Server javobini kutish — masalan yangi buyurtma raqamini ko'rsatish
  /// uchun. [timeout] ichida javob kelmasa `null` (amal navbatda qoladi).
  Future<Map<String, dynamic>?> resultOf(String actionId, Duration timeout) {
    final completer = _results.putIfAbsent(actionId, Completer.new);
    return completer.future.timeout(timeout, onTimeout: () => null);
  }

  /// Rad etilgan amalni qayta navbatga qo'yadi.
  void retry(String actionId) {
    _set([
      for (final a in state) a.id == actionId ? a.copyWith(failed: false, attempts: 0, clearError: true) : a,
    ]);
    _backoffStep = 0;
    _scheduleDrain(Duration.zero);
  }

  /// Amalni butunlay bekor qiladi — ekran serverdagi holatga qaytadi.
  void discard(String actionId) {
    _set(state.where((a) => a.id != actionId).toList());
    _results.remove(actionId)?.complete(null);
  }

  void _scheduleDrain(Duration delay) {
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, _drain);
  }

  Future<void> _drain() async {
    if (_draining) return;
    final employeeId = _employeeId;
    if (employeeId == null) return;
    _draining = true;
    try {
      while (_employeeId == employeeId) {
        PendingAction? next;
        for (final a in state) {
          if (!a.failed && !a.acked) {
            next = a;
            break;
          }
        }
        if (next == null) return;

        final outcome = await _send(next);
        // Yuborish paytida xodim almashgan bo'lsa — to'xtaymiz. Amal eski
        // xodimning navbatida qoladi; keyingi safar u kirganda qayta
        // yuboriladi va server uni takror deb tanib o'sha javobni beradi.
        if (_employeeId != employeeId) return;

        switch (outcome) {
          case _Accepted(:final body):
            _accept(next.id, body);
            _backoffStep = 0;
          case _Rejected(:final message):
            _update(next.id, (a) => a.copyWith(failed: true, error: message, attempts: a.attempts + 1));
            _results.remove(next.id)?.complete(null);
          case _Transient():
            _update(next.id, (a) => a.copyWith(attempts: a.attempts + 1));
            final delay = _backoff[_backoffStep.clamp(0, _backoff.length - 1)];
            _backoffStep++;
            _scheduleDrain(delay);
            return;
        }
      }
    } finally {
      _draining = false;
      // Yuborish paytida boshqa xodim kirgan bo'lsa, uning navbati shu
      // tsikl tugashini kutib qolmasin.
      if (_employeeId != employeeId) _scheduleDrain(Duration.zero);
    }
  }

  void _update(String id, PendingAction Function(PendingAction) change) {
    _set([for (final a in state) a.id == id ? change(a) : a]);
  }

  void _accept(String id, Map<String, dynamic> body) {
    _update(id, (a) => a.copyWith(acked: true));
    _results.remove(id)?.complete(body);
    _ackTimers[id] = Timer(_ackGrace, () {
      _ackTimers.remove(id);
      _set(state.where((a) => a.id != id).toList());
    });
  }

  Future<_Outcome> _send(PendingAction a) async {
    try {
      final token = await ref.read(idTokenProvider)();
      if (token == null) return const _Transient();
      final body = await ref.read(apiClientProvider).post(a.path, body: a.body, idToken: token).timeout(_sendTimeout);
      return _Accepted(body);
    } on ApiException catch (e) {
      if (e.status == 401) {
        return a.attempts + 1 >= _maxAuthRetries
            ? const _Rejected("Sessiya tugagan — tizimga qayta kiring")
            : const _Transient();
      }
      final transient = e.status == 0 ||
          e.status >= 500 ||
          e.status == 408 ||
          e.status == 429 ||
          (e.status == 409 && e.code == 'in-progress');
      return transient ? const _Transient() : _Rejected(e.message);
    } catch (_) {
      // Tarmoq, vaqt tugashi, internetsiz token yangilash — hammasi o'tkinchi.
      return const _Transient();
    }
  }
}

sealed class _Outcome {
  const _Outcome();
}

class _Accepted extends _Outcome {
  final Map<String, dynamic> body;
  const _Accepted(this.body);
}

class _Rejected extends _Outcome {
  final String message;
  const _Rejected(this.message);
}

class _Transient extends _Outcome {
  const _Transient();
}

final actionQueueProvider = NotifierProvider<ActionQueue, List<PendingAction>>(ActionQueue.new);

/// Joriy foydalanuvchi tokeni — testlarda almashtiriladi (u yerda Firebase yo'q).
final idTokenProvider = Provider<Future<String?> Function()>(
  (ref) => () async => FirebaseAuth.instance.currentUser?.getIdToken(),
);

/// Serverga hali yetmagan amallar soni (rad etilganlari kirmaydi).
final pendingActionCountProvider = Provider<int>((ref) {
  return ref.watch(actionQueueProvider).where((a) => !a.failed && !a.acked).length;
});

/// Server rad etgan va xodim qarorini kutayotgan amallar.
final failedActionsProvider = Provider<List<PendingAction>>((ref) {
  return ref.watch(actionQueueProvider).where((a) => a.failed).toList();
});

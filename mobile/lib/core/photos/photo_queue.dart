import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/item_photo.dart';
import '../models/order_item.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart' show apiClientProvider, employeeClaimsProvider;
import '../services/connectivity_service.dart';
import '../services/local_store.dart';
import '../sync/action_queue.dart' show idTokenProvider;
import '../sync/pending_action.dart' show newActionId;
import 'photo_cache.dart';
import 'photo_services.dart';

/// Rasm amali — yuklash yoki o'chirish. Qurilmada saqlanadi: internet
/// bo'lmasa ham rasm darhol "saqlangan" bo'lib ko'rinadi va ulanish
/// tiklanishi bilan o'zi yuklanadi (ilova yopilib ochilsa ham).
class PhotoOp {
  static const upload = 'upload';
  static const delete = 'delete';

  final String id;
  final String kind;
  final String orderId;
  final String itemId;
  final PhotoState state;

  /// Yuklanadigan rasm (ilova papkasidagi nusxa).
  final String? localPath;

  /// Yuklash: ImageKit'ga yuklangach to'ladi (qayta urinishda qayta
  /// yuklanmaydi, faqat biriktiriladi). O'chirish: qaysi rasm.
  final String? fileId;
  final String? url;

  /// "#1245 · 1245/2 Gilam — eski rasm".
  final String label;
  final DateTime createdAt;
  final bool failed;
  final String? error;
  final int attempts;

  /// Hozir yuborilmoqda (saqlanmaydi).
  final bool sending;

  /// Server qabul qildi — ekran yangilanishini kutib bir oz turadi (saqlanmaydi).
  final bool done;

  const PhotoOp({
    required this.id,
    required this.kind,
    required this.orderId,
    required this.itemId,
    required this.state,
    required this.label,
    required this.createdAt,
    this.localPath,
    this.fileId,
    this.url,
    this.failed = false,
    this.error,
    this.attempts = 0,
    this.sending = false,
    this.done = false,
  });

  bool get isUpload => kind == upload;

  PhotoOp copyWith({
    String? kind,
    String? fileId,
    String? url,
    bool? failed,
    String? error,
    bool clearError = false,
    int? attempts,
    bool? sending,
    bool? done,
  }) {
    return PhotoOp(
      id: id,
      kind: kind ?? this.kind,
      orderId: orderId,
      itemId: itemId,
      state: state,
      label: label,
      createdAt: createdAt,
      localPath: localPath,
      fileId: fileId ?? this.fileId,
      url: url ?? this.url,
      failed: failed ?? this.failed,
      error: clearError ? null : (error ?? this.error),
      attempts: attempts ?? this.attempts,
      sending: sending ?? this.sending,
      done: done ?? this.done,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'orderId': orderId,
        'itemId': itemId,
        'state': state.key,
        'label': label,
        'createdAt': createdAt.millisecondsSinceEpoch,
        if (localPath != null) 'localPath': localPath,
        if (fileId != null) 'fileId': fileId,
        if (url != null) 'url': url,
        if (failed) 'failed': true,
        if (error != null) 'error': error,
        'attempts': attempts,
      };

  static PhotoOp? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    final kind = raw['kind'];
    final orderId = raw['orderId'];
    final itemId = raw['itemId'];
    final state = PhotoState.fromKey(raw['state']);
    if (id is! String || (kind != upload && kind != delete) || orderId is! String || itemId is! String || state == null) {
      return null;
    }
    final op = PhotoOp(
      id: id,
      kind: kind as String,
      orderId: orderId,
      itemId: itemId,
      state: state,
      label: raw['label']?.toString() ?? '',
      createdAt: DateTime.fromMillisecondsSinceEpoch((raw['createdAt'] as num?)?.toInt() ?? 0),
      localPath: raw['localPath'] as String?,
      fileId: raw['fileId'] as String?,
      url: raw['url'] as String?,
      failed: raw['failed'] == true,
      error: raw['error'] as String?,
      attempts: (raw['attempts'] as num?)?.toInt() ?? 0,
    );
    // Buzilgan yozuv: yuklashda fayl ham, natija ham yo'q; o'chirishda — qaysi rasm.
    if (op.isUpload ? (op.localPath == null && op.fileId == null) : op.fileId == null) return null;
    return op;
  }
}

/// Mahsulot rasmlari katakchasi: serverdagi rasm yoki navbatdagi yuklama.
class PhotoSlot {
  final PhotoState state;
  final ItemPhoto? photo;
  final PhotoOp? op;
  const PhotoSlot.server(this.state, ItemPhoto this.photo) : op = null;
  const PhotoSlot.pending(this.state, PhotoOp this.op) : photo = null;

  String? get url => photo?.url ?? op?.url;
}

/// Ekranda ko'rinadigan rasmlar: serverdagilar (o'chirilayotganlarisiz) +
/// hali serverga yetmagan yuklamalar.
List<PhotoSlot> photoSlotsOf(String orderId, OrderItem item, PhotoState state, List<PhotoOp> ops) {
  final mine = ops.where((o) => o.orderId == orderId && o.itemId == item.id).toList();
  final deleting = {
    for (final o in mine)
      if (!o.isUpload && !o.failed && o.fileId != null) o.fileId!,
  };
  return [
    for (final p in item.photos.of(state))
      if (!deleting.contains(p.fileId)) PhotoSlot.server(state, p),
    for (final o in mine)
      if (o.isUpload && o.state == state && !(o.fileId != null && item.photos.contains(o.fileId!))) PhotoSlot.pending(state, o),
  ];
}

/// Rasm amallari navbati — ActionQueue (core/sync/action_queue.dart) bilan
/// bir xil tamoyil: xodimga bog'langan, tartib bilan, internet qaytishi
/// bilan darhol, vaqtinchalik xatoda ortib boruvchi oraliq bilan.
class PhotoQueue extends Notifier<List<PhotoOp>> {
  static const _ackGrace = Duration(seconds: 8);
  static const _sendTimeout = Duration(seconds: 75);
  static const _backoff = [Duration(seconds: 3), Duration(seconds: 10), Duration(seconds: 30), Duration(seconds: 60)];
  static const _maxAuthRetries = 5;
  static const _lostCaptureKey = 'photo.captureContext';

  String? _employeeId;
  bool _draining = false;

  /// Navbat yopilgan (ilova/sessiya tugadi) — davom etayotgan yuborish
  /// natijasi endi hech qayerga yozilmaydi.
  bool _disposed = false;
  Timer? _retryTimer;
  int _backoffStep = 0;
  final _ackTimers = <String, Timer>{};

  @override
  List<PhotoOp> build() {
    _employeeId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;
    _disposed = false;
    ref.onDispose(() {
      _disposed = true;
      _retryTimer?.cancel();
      for (final t in _ackTimers.values) {
        t.cancel();
      }
      _ackTimers.clear();
    });
    ref.listen<AsyncValue<bool>>(connectivityProvider, (prev, next) {
      if (next.valueOrNull == true && prev?.valueOrNull != true) {
        _backoffStep = 0;
        _scheduleDrain(Duration.zero);
      }
    });

    final loaded = _load();
    if (loaded.isNotEmpty) _scheduleDrain(Duration.zero);
    if (_employeeId != null) Future.microtask(_recoverLostCapture);
    return loaded;
  }

  String _key(String employeeId) => 'photoQueue.v1.$employeeId';

  List<PhotoOp> _load() {
    final id = _employeeId;
    if (id == null) return const [];
    final raw = ref.read(localStoreProvider).getString(_key(id));
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List).map(PhotoOp.fromJson).whereType<PhotoOp>().toList();
    } catch (_) {
      return const [];
    }
  }

  void _set(List<PhotoOp> next) {
    if (_disposed) return;
    state = next;
    final id = _employeeId;
    if (id == null) return;
    final persistable = [for (final o in next) if (!o.done) o.toJson()];
    final store = ref.read(localStoreProvider);
    if (persistable.isEmpty) {
      store.remove(_key(id));
    } else {
      store.setString(_key(id), jsonEncode(persistable));
    }
  }

  void _update(String id, PhotoOp Function(PhotoOp) change) {
    if (_disposed) return;
    _set([for (final o in state) o.id == id ? change(o) : o]);
  }

  PhotoOp? _find(String id) {
    for (final o in state) {
      if (o.id == id) return o;
    }
    return null;
  }

  /// Kamera ochilishidan oldin: rasm qaysi mahsulotga ekanini eslab qoladi
  /// (Android ilovani xotiradan chiqarib yuborsa, qayta ochilganda tiklanadi).
  Future<void> rememberCapture({required String orderId, required String itemId, required PhotoState state, required String label}) {
    return ref.read(localStoreProvider).setJson(_lostCaptureKey, {
      'orderId': orderId,
      'itemId': itemId,
      'state': state.key,
      'label': label,
      'employeeId': _employeeId,
    });
  }

  Future<void> forgetCapture() => ref.read(localStoreProvider).remove(_lostCaptureKey);

  Future<void> _recoverLostCapture() async {
    try {
      final store = ref.read(localStoreProvider);
      final ctx = store.getJson(_lostCaptureKey);
      if (ctx == null) return;
      final paths = await ref.read(photoPickerProvider).retrieveLost();
      if (paths.isEmpty) return;
      await store.remove(_lostCaptureKey);
      final state = PhotoState.fromKey(ctx['state']);
      if (state == null || ctx['employeeId'] != _employeeId) return;
      await addFiles(
        orderId: ctx['orderId'] as String,
        itemId: ctx['itemId'] as String,
        state: state,
        label: ctx['label']?.toString() ?? 'Rasm',
        paths: paths.take(kMaxPhotosPerState).toList(),
      );
    } catch (_) {
      // Tiklab bo'lmasa — xodim rasmni qaytadan oladi.
    }
  }

  /// Rasmlarni navbatga qo'yadi: ilova papkasiga ko'chiriladi (vaqtinchalik
  /// fayl tozalanib ketmasin) va darhol yuklashga harakat qilinadi.
  Future<void> addFiles({
    required String orderId,
    required String itemId,
    required PhotoState state,
    required String label,
    required List<String> paths,
  }) async {
    if (paths.isEmpty) return;
    final dir = await ref.read(photoStorageDirProvider.future);
    final ops = <PhotoOp>[];
    for (final path in paths) {
      final id = newActionId();
      final target = '${dir.path}${Platform.pathSeparator}$id.jpg';
      await File(path).copy(target);
      ops.add(PhotoOp(
        id: id,
        kind: PhotoOp.upload,
        orderId: orderId,
        itemId: itemId,
        state: state,
        label: label,
        createdAt: DateTime.now(),
        localPath: target,
      ));
    }
    _set([...this.state, ...ops]);
    _backoffStep = 0;
    _scheduleDrain(Duration.zero);
  }

  /// Serverdagi rasmni o'chirish (navbat orqali — ekrandan darhol yo'qoladi).
  void deletePhoto({required String orderId, required String itemId, required PhotoState state, required String fileId, required String label}) {
    if (this.state.any((o) => !o.isUpload && o.fileId == fileId && !o.failed)) return;
    _set([
      ...this.state.where((o) => !(o.isUpload && o.fileId == fileId)),
      PhotoOp(
        id: newActionId(),
        kind: PhotoOp.delete,
        orderId: orderId,
        itemId: itemId,
        state: state,
        label: label,
        createdAt: DateTime.now(),
        fileId: fileId,
      ),
    ]);
    _backoffStep = 0;
    _scheduleDrain(Duration.zero);
  }

  /// Navbatdagi yuklamani bekor qiladi. ImageKit'ga yetib borgan bo'lsa,
  /// u yerdan ham o'chiriladi (egasiz fayl qolmasin).
  Future<void> cancel(String opId) async {
    final op = _find(opId);
    if (op == null || op.sending) return;
    if (!op.isUpload) {
      _set(state.where((o) => o.id != opId).toList());
      return;
    }
    await _deleteLocal(op);
    if (op.fileId == null) {
      _set(state.where((o) => o.id != opId).toList());
      return;
    }
    _set([
      for (final o in state)
        if (o.id == opId) o.copyWith(kind: PhotoOp.delete, failed: false, clearError: true, attempts: 0, done: false) else o,
    ]);
    _backoffStep = 0;
    _scheduleDrain(Duration.zero);
  }

  void retry(String opId) {
    _update(opId, (o) => o.copyWith(failed: false, clearError: true, attempts: 0));
    _backoffStep = 0;
    _scheduleDrain(Duration.zero);
  }

  Future<void> _deleteLocal(PhotoOp op) async {
    final path = op.localPath;
    if (path == null) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {}
  }

  void _scheduleDrain(Duration delay) {
    if (_disposed) return;
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
        PhotoOp? next;
        for (final o in state) {
          if (!o.failed && !o.done) {
            next = o;
            break;
          }
        }
        if (next == null) return;

        _update(next.id, (o) => o.copyWith(sending: true));
        final outcome = await _process(next);
        if (_disposed || _employeeId != employeeId) return;

        switch (outcome) {
          case _Done():
            _update(next.id, (o) => o.copyWith(sending: false, done: true));
            _backoffStep = 0;
            final id = next.id;
            _ackTimers[id] = Timer(_ackGrace, () {
              _ackTimers.remove(id);
              _set(state.where((o) => o.id != id).toList());
            });
          case _Rejected(:final message):
            _update(next.id, (o) => o.copyWith(sending: false, failed: true, error: message, attempts: o.attempts + 1));
          case _Transient():
            _update(next.id, (o) => o.copyWith(sending: false, attempts: o.attempts + 1));
            final delay = _backoff[_backoffStep.clamp(0, _backoff.length - 1)];
            _backoffStep++;
            _scheduleDrain(delay);
            return;
        }
      }
    } finally {
      _draining = false;
      if (_employeeId != employeeId) _scheduleDrain(Duration.zero);
    }
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final token = await ref.read(idTokenProvider)();
    if (token == null) throw const _NoToken();
    return ref.read(apiClientProvider).post(path, body: body, idToken: token).timeout(_sendTimeout);
  }

  Future<_Outcome> _process(PhotoOp op) async {
    final target = {'orderId': op.orderId, 'itemId': op.itemId, 'state': op.state.key};
    try {
      if (!op.isUpload) {
        await _post('/deleteItemPhoto', {...target, 'fileId': op.fileId});
        return const _Done();
      }

      var fileId = op.fileId;
      var url = op.url;
      List<int>? bytes;
      if (fileId == null) {
        final file = File(op.localPath ?? '');
        if (!await file.exists()) return const _Rejected("Rasm fayli telefonda topilmadi — qaytadan oling");
        bytes = await file.readAsBytes();
        final auth = UploadAuth.fromJson(await _post('/itemPhotoUploadAuth', target));
        final uploaded = await ref.read(photoUploaderProvider).upload(auth, bytes);
        fileId = uploaded.fileId;
        url = uploaded.url;
        // Darhol saqlanadi: keyingi urinishda qayta yuklanmaydi, faqat biriktiriladi.
        _update(op.id, (o) => o.copyWith(fileId: uploaded.fileId, url: uploaded.url));
      }

      final res = await _post('/addItemPhoto', {...target, 'fileId': fileId});
      final photo = res['photo'];
      final finalUrl = photo is Map && photo['url'] is String ? photo['url'] as String : url;
      if (finalUrl != null) {
        try {
          bytes ??= await File(op.localPath ?? '').readAsBytes();
          await cacheUploadedPhoto(ref.read(photoCachesProvider), finalUrl, bytes);
        } catch (_) {}
        _update(op.id, (o) => o.copyWith(url: finalUrl));
      }
      await _deleteLocal(op);
      return const _Done();
    } on ApiException catch (e) {
      if (e.status == 401) {
        return op.attempts + 1 >= _maxAuthRetries ? const _Rejected("Sessiya tugagan — tizimga qayta kiring") : const _Transient();
      }
      final transient = e.status == 0 || e.status >= 500 || e.status == 408 || e.status == 429;
      return transient ? const _Transient() : _Rejected(e.message);
    } on PhotoUploadException catch (e) {
      return e.transient ? const _Transient() : _Rejected(e.message);
    } on FormatException {
      return const _Rejected("Server javobi noto'g'ri — keyinroq qayta urinib ko'ring");
    } catch (_) {
      return const _Transient();
    }
  }
}

class _NoToken implements Exception {
  const _NoToken();
}

sealed class _Outcome {
  const _Outcome();
}

class _Done extends _Outcome {
  const _Done();
}

class _Rejected extends _Outcome {
  final String message;
  const _Rejected(this.message);
}

class _Transient extends _Outcome {
  const _Transient();
}

final photoQueueProvider = NotifierProvider<PhotoQueue, List<PhotoOp>>(PhotoQueue.new);

/// Navbatdagi (rad etilmagan) rasm amallari soni.
final pendingPhotoCountProvider = Provider<int>((ref) {
  return ref.watch(photoQueueProvider).where((o) => !o.failed && !o.done).length;
});

final failedPhotoOpsProvider = Provider<List<PhotoOp>>((ref) {
  return ref.watch(photoQueueProvider).where((o) => o.failed).toList();
});

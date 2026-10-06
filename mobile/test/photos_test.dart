import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file/file.dart' as fs;
import 'package:file/memory.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/item_photo.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/photos/photo_cache.dart';
import 'package:selta_cleaning/core/photos/photo_queue.dart';
import 'package:selta_cleaning/core/photos/photo_services.dart';
import 'package:selta_cleaning/core/services/api_client.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/services/order_items_provider.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/overlay.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/photos/item_photos_chip.dart';
import 'package:selta_cleaning/features/photos/item_photos_sheet.dart';
import 'package:selta_cleaning/features/shared/item_detail_row.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Server o'rnida: har bir yo'l uchun javobni test belgilaydi.
class _Api extends ApiClient {
  final calls = <(String, Map<String, dynamic>)>[];
  FutureOr<Map<String, dynamic>> Function(String path, Map<String, dynamic> body) handler = (_, __) => const {'ok': true};

  @override
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body, String? idToken}) async {
    calls.add((path, body ?? const {}));
    return handler(path, body ?? const {});
  }

  List<String> get paths => [for (final c in calls) c.$1];
}

Map<String, dynamic> authJson([String folder = '/selta/orders/o1/i1']) => {
      'uploadUrl': 'https://upload.imagekit.io/api/v1/files/upload',
      'publicKey': 'pub',
      'token': 'tok-1',
      'expire': 1900000000,
      'signature': 'sig',
      'folder': folder,
      'fileName': 'before.jpg',
    };

class _Uploader implements PhotoUploader {
  final uploads = <List<int>>[];
  Object? error;
  int next = 1;

  @override
  Future<UploadedPhoto> upload(UploadAuth auth, List<int> bytes) async {
    if (error != null) throw error!;
    uploads.add(bytes);
    final id = 'ik${next++}';
    return UploadedPhoto(id, 'https://ik.imagekit.io/selta${auth.folder}/$id.jpg');
  }
}

class _Picker implements PhotoPicker {
  List<String> result = const [];
  List<String> lost = const [];
  final requests = <(bool, int)>[];

  @override
  Future<List<String>> pick({required bool camera, required int max}) async {
    requests.add((camera, max));
    return result;
  }

  @override
  Future<List<String>> retrieveLost() async => lost;
}

/// Kesh: yozilganini eslab qoladi, tarmoqqa chiqmaydi (rasm "yuklanayotgan" holatda qoladi).
class _Cache implements BaseCacheManager {
  final put = <String, int>{};

  @override
  Future<fs.File> putFile(String url, Uint8List fileBytes, {String? key, String? eTag, Duration maxAge = const Duration(days: 30), String fileExtension = 'file'}) async {
    put[url] = fileBytes.length;
    return MemoryFileSystem().file('x');
  }

  @override
  Stream<FileResponse> getFileStream(String url, {String? key, Map<String, String>? headers, bool withProgress = false}) =>
      StreamController<FileResponse>().stream;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

OrderItem gilam({ItemPhotos photos = ItemPhotos.empty, String id = 'i1'}) => OrderItem(
      id: id,
      itemNumber: 2,
      name: 'Gilam',
      area: 12,
      price: 100000,
      qcStatus: 'pending',
      status: 'washing',
      photos: photos,
    );

ItemPhoto ph(String id, {String? by}) => ItemPhoto(fileId: id, url: 'https://ik.imagekit.io/selta/$id.jpg', uploadedByName: by);

const _allPerms = {'canViewPhotos': true, 'canUploadPhotos': true, 'canDeletePhotos': true};

void main() {
  group('model', () {
    test("rasmlar: Firestore vaqti ham, millisekund ham; buzilgani tashlanadi", () {
      final photos = ItemPhotos.fromRaw({
        'before': [
          {'fileId': 'a', 'url': 'u1', 'width': 1200, 'uploadedByName': 'Vali', 'uploadedAt': Timestamp.fromMillisecondsSinceEpoch(1000)},
          {'fileId': 'b'},
          'buzuq',
        ],
        'ready': [
          {'fileId': 'c', 'url': 'u3', 'uploadedAt': 2000},
        ],
      });
      expect(photos.before.single.fileId, 'a');
      expect(photos.before.single.uploadedAt, DateTime.fromMillisecondsSinceEpoch(1000));
      expect(photos.ready.single.uploadedAt, DateTime.fromMillisecondsSinceEpoch(2000));
      expect(photos.contains('c'), isTrue);
      expect(identical(ItemPhotos.fromRaw(null), ItemPhotos.empty), isTrue);
      expect(identical(ItemPhotos.fromRaw({'before': []}), ItemPhotos.empty), isTrue);
    });

    test("mahsulot (va buyurtmadagi nusxa) rasmlarni o'qiydi, copyWith saqlaydi", () {
      final item = OrderItem.fromMap('i1', {
        'name': 'Gilam',
        'photos': {
          'before': [
            {'fileId': 'a', 'url': 'u'},
          ],
        },
      });
      expect(item.photos.before.single.fileId, 'a');
      expect(item.copyWith(status: 'packing').photos.before.single.fileId, 'a');
    });

    test("navbatdagi mahsulot o'zgarishi rasmlarni yo'qotmaydi", () {
      final base = gilam(photos: ItemPhotos(before: [ph('a')], ready: [ph('b')]));
      final action = PendingAction(
        id: 'x' * 20,
        path: '/changeItemStatus',
        body: const {},
        orderId: 'o1',
        label: '',
        createdAt: DateTime(2026),
        effect: {
          'kind': EffectKind.itemsChange,
          'upserts': [itemToJson(base.copyWith(status: 'packing'))],
        },
      );
      // JSON orqali (navbat qurilmada shunday saqlanadi).
      final restored = PendingAction.fromJson(jsonDecode(jsonEncode(action.toJson())))!;
      final result = applyToItems('o1', [base], [restored]).single;
      expect(result.status, 'packing');
      expect(result.photos.before.single.fileId, 'a');
      expect(result.photos.ready.single.fileId, 'b');
    });

    test('vakolatlar: admin — hammasi, xodim — bayroqlar', () {
      final admin = PhotoPermissions.of(null, 'admin');
      expect([admin.canView, admin.canUpload, admin.canDelete], [true, true, true]);
      final viewer = PhotoPermissions.of({'canViewPhotos': true}, 'worker');
      expect([viewer.canView, viewer.canUpload, viewer.canDelete, viewer.any], [true, false, false, true]);
      expect(PhotoPermissions.of(const {}, 'delivery').any, isFalse);
    });

    test('navbat yozuvi JSON orqali tiklanadi, buzilgani tashlanadi', () {
      final op = PhotoOp(
        id: 'a' * 20,
        kind: PhotoOp.upload,
        orderId: 'o1',
        itemId: 'i1',
        state: PhotoState.ready,
        label: 'L',
        createdAt: DateTime(2026, 10, 6),
        localPath: '/p/a.jpg',
        fileId: 'f',
        failed: true,
        error: 'xato',
        sending: true,
      );
      final back = PhotoOp.fromJson(jsonDecode(jsonEncode(op.toJson())))!;
      expect([back.kind, back.state, back.localPath, back.fileId, back.failed, back.error, back.sending],
          [PhotoOp.upload, PhotoState.ready, '/p/a.jpg', 'f', true, 'xato', false]);
      expect(PhotoOp.fromJson({'id': 'a', 'kind': 'upload', 'orderId': 'o', 'itemId': 'i', 'state': 'before'}), isNull);
      expect(PhotoOp.fromJson({'id': 'a', 'kind': 'hack', 'orderId': 'o', 'itemId': 'i', 'state': 'before', 'fileId': 'f'}), isNull);
    });

    test("ko'rinadigan rasmlar: o'chirilayotgani yashirinadi, yuklama qo'shiladi, takror yo'q", () {
      final item = gilam(photos: ItemPhotos(before: [ph('a'), ph('b')], ready: [ph('c')]));
      PhotoOp op(String id, String kind, {String? fileId, bool failed = false, PhotoState state = PhotoState.ready, String itemId = 'i1'}) => PhotoOp(
            id: id,
            kind: kind,
            orderId: 'o1',
            itemId: itemId,
            state: state,
            label: '',
            createdAt: DateTime(2026),
            localPath: kind == PhotoOp.upload ? '/p/$id.jpg' : null,
            fileId: fileId,
            failed: failed,
          );
      final ops = [
        op('d1', PhotoOp.delete, fileId: 'a', state: PhotoState.before),
        op('d2', PhotoOp.delete, fileId: 'b', state: PhotoState.before, failed: true),
        op('u1', PhotoOp.upload),
        op('u2', PhotoOp.upload, fileId: 'c'), // server allaqachon biriktirgan
        op('u3', PhotoOp.upload, itemId: 'other'),
      ];
      final before = photoSlotsOf('o1', item, PhotoState.before, ops);
      expect(before.map((s) => s.photo?.fileId), ['b'], reason: "rad etilgan o'chirish — rasm qaytadi");
      final ready = photoSlotsOf('o1', item, PhotoState.ready, ops);
      expect(ready.map((s) => s.photo?.fileId ?? s.op?.id), ['c', 'u1']);
    });

    test("kichik nusxa manzili: ImageKit kichraytiradi", () {
      expect(photoThumbUrl('https://ik.imagekit.io/s/a.jpg'), 'https://ik.imagekit.io/s/a.jpg?tr=w-400,h-400,c-at_max,q-70');
      expect(photoThumbUrl('https://ik.imagekit.io/s/a.jpg?v=1'), endsWith('?v=1&tr=w-400,h-400,c-at_max,q-70'));
    });
  });

  group('ImageKit yuklash', () {
    test('imzo bilan multipart — faqat upload.imagekit.io ga', () async {
      late http.BaseRequest sent;
      late String body;
      final client = MockClient.streaming((request, bodyStream) async {
        sent = request;
        body = utf8.decode(await bodyStream.toBytes(), allowMalformed: true);
        return http.StreamedResponse(
          Stream.value(utf8.encode(jsonEncode({'fileId': 'F1', 'url': 'https://ik.imagekit.io/s/a.jpg', 'filePath': '/a.jpg'}))),
          200,
        );
      });
      final result = await ImageKitUploader(client: client).upload(UploadAuth.fromJson(authJson()), [1, 2, 3]);
      expect(result.fileId, 'F1');
      expect(result.url, 'https://ik.imagekit.io/s/a.jpg');
      expect(sent.url.toString(), 'https://upload.imagekit.io/api/v1/files/upload');
      expect(sent.method, 'POST');
      for (final field in ['publicKey', 'signature', 'expire', 'token', 'folder', 'fileName', 'useUniqueFileName']) {
        expect(body, contains('name="$field"'));
      }
      expect(body, contains('1900000000'));
      expect(body, contains('/selta/orders/o1/i1'));
      expect(body, contains('name="file"; filename="before.jpg"'));
      expect(body, isNot(contains('private')));
    });

    test("boshqa manzilga yuborilmaydi", () async {
      var called = false;
      final client = MockClient((_) async {
        called = true;
        return http.Response('{}', 200);
      });
      final auth = UploadAuth.fromJson({...authJson(), 'uploadUrl': 'https://evil.example.com/upload'});
      await expectLater(
        ImageKitUploader(client: client).upload(auth, [1]),
        throwsA(isA<PhotoUploadException>().having((e) => e.transient, 'transient', false)),
      );
      expect(called, isFalse);
    });

    test("xizmat band — keyinroq; noto'g'ri so'rov — xabar bilan; internet yo'q — keyinroq", () async {
      Future<PhotoUploadException> run(http.Client client) async {
        try {
          await ImageKitUploader(client: client).upload(UploadAuth.fromJson(authJson()), [1]);
        } on PhotoUploadException catch (e) {
          return e;
        }
        fail('xato kutilgan edi');
      }

      expect((await run(MockClient((_) async => http.Response('{}', 503)))).transient, isTrue);
      final bad = await run(MockClient((_) async => http.Response(jsonEncode({'message': 'Invalid signature'}), 400)));
      expect(bad.transient, isFalse);
      expect(bad.message, contains('Invalid signature'));
      expect((await run(MockClient((_) async => throw http.ClientException('offline')))).transient, isTrue);
    });

    test("imzo javobi to'liq bo'lmasa — xato", () {
      expect(() => UploadAuth.fromJson({...authJson()}..remove('signature')), throwsFormatException);
      expect(() => UploadAuth.fromJson({...authJson(), 'expire': 'x'}), throwsFormatException);
    });
  });

  group('navbat', () {
    late Directory dir;
    late _Api api;
    late _Uploader uploader;
    late _Picker picker;
    late _Cache cache;
    late SharedPreferences prefs;
    String? token;
    final containers = <ProviderContainer>[];

    setUp(() async {
      dir = Directory.systemTemp.createTempSync('photo_queue_test');
      api = _Api();
      uploader = _Uploader();
      picker = _Picker();
      cache = _Cache();
      token = 'tok';
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
    });

    tearDown(() {
      for (final c in containers) {
        c.dispose();
      }
      containers.clear();
      try {
        dir.deleteSync(recursive: true);
      } catch (_) {}
    });

    ProviderContainer make({String employeeId = 'e1'}) {
      final c = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(api),
        idTokenProvider.overrideWithValue(() async => token),
        localStoreProvider.overrideWithValue(LocalStore(prefs)),
        employeeClaimsProvider.overrideWith((ref) async => EmployeeClaims(employeeId: employeeId, role: 'worker', department: 'worker')),
        connectivityProvider.overrideWith((ref) => Stream.value(true)),
        photoUploaderProvider.overrideWithValue(uploader),
        photoPickerProvider.overrideWithValue(picker),
        photoStorageDirProvider.overrideWith((ref) async => dir),
        photoCachesProvider.overrideWithValue(PhotoCaches(thumbs: cache, full: cache)),
      ]);
      containers.add(c);
      c.listen(photoQueueProvider, (_, __) {});
      return c;
    }

    Future<void> ready(ProviderContainer c) async {
      await c.read(employeeClaimsProvider.future);
      c.read(photoQueueProvider);
      await Future<void>.delayed(Duration.zero);
    }

    Future<void> until(bool Function() condition) async {
      for (var i = 0; i < 200 && !condition(); i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(condition(), isTrue);
    }

    File shot(String name) => File('${dir.path}/../$name')..writeAsBytesSync(List.filled(1000, 7));

    Future<void> add(ProviderContainer c, {PhotoState state = PhotoState.before, int count = 1}) =>
        c.read(photoQueueProvider.notifier).addFiles(
              orderId: 'o1',
              itemId: 'i1',
              state: state,
              label: '1245/2 Gilam — eski rasm',
              paths: [for (var i = 0; i < count; i++) shot('cam_${DateTime.now().microsecondsSinceEpoch}_$i.jpg').path],
            );

    test("yuklash: imzo → ImageKit → biriktirish; fayl o'chadi, keshga yoziladi", () async {
      api.handler = (path, body) => switch (path) {
            '/itemPhotoUploadAuth' => authJson(),
            '/addItemPhoto' => {
                'ok': true,
                'photo': {'fileId': body['fileId'], 'url': 'https://ik.imagekit.io/selta/final.jpg'},
              },
            _ => const {},
          };
      final c = make();
      await ready(c);
      await add(c);
      final op = c.read(photoQueueProvider).single;
      expect(op.localPath, startsWith(dir.path), reason: "ilova papkasiga ko'chiriladi");
      await until(() => c.read(photoQueueProvider).single.done);

      expect(api.paths, ['/itemPhotoUploadAuth', '/addItemPhoto']);
      expect(api.calls.first.$2, {'orderId': 'o1', 'itemId': 'i1', 'state': 'before'});
      expect(api.calls.last.$2, {'orderId': 'o1', 'itemId': 'i1', 'state': 'before', 'fileId': 'ik1'});
      expect(uploader.uploads.single.length, 1000);
      expect(File(op.localPath!).existsSync(), isFalse);
      expect(cache.put.keys, containsAll(['https://ik.imagekit.io/selta/final.jpg', photoThumbUrl('https://ik.imagekit.io/selta/final.jpg')]),
          reason: "o'zi olgan rasm qayta yuklanmaydi");
      expect(prefs.getString('photoQueue.v1.e1'), isNull, reason: 'bajarilgani saqlanmaydi');
    });

    test("internet yo'q: navbatda turadi, ilova qayta ochilsa ham yo'qolmaydi", () async {
      token = null; // internetsiz token yangilanmaydi
      final c = make();
      await ready(c);
      await add(c, count: 2);
      await until(() => c.read(photoQueueProvider).every((o) => o.attempts >= 1 || o.sending == false));
      final ops = c.read(photoQueueProvider);
      expect(ops, hasLength(2));
      expect(ops.every((o) => !o.failed && !o.done), isTrue);
      expect(api.calls, isEmpty);
      final saved = jsonDecode(prefs.getString('photoQueue.v1.e1')!) as List;
      expect(saved, hasLength(2));
      c.dispose();
      containers.remove(c);

      // Qayta ochildi, internet bor.
      token = 'tok';
      api.handler = (path, body) => path == '/itemPhotoUploadAuth' ? authJson() : const {'ok': true};
      final c2 = make();
      await ready(c2);
      expect(c2.read(photoQueueProvider), hasLength(2));
      await until(() => c2.read(photoQueueProvider).every((o) => o.done));
      expect(api.paths.where((p) => p == '/addItemPhoto'), hasLength(2));
    });

    test("ImageKit'ga yuklangach biriktirish uzilsa — qayta yuklanmaydi, faqat biriktiriladi", () async {
      var attachFails = true;
      api.handler = (path, body) {
        if (path == '/itemPhotoUploadAuth') return authJson();
        if (attachFails) throw const ApiException(0, 'unavailable', "Serverga ulanib bo'lmadi");
        return const {'ok': true};
      };
      final c = make();
      await ready(c);
      await add(c);
      await until(() => c.read(photoQueueProvider).single.fileId != null && !c.read(photoQueueProvider).single.sending);
      expect(uploader.uploads, hasLength(1));
      expect(jsonDecode(prefs.getString('photoQueue.v1.e1')!)[0]['fileId'], 'ik1', reason: 'natija darhol saqlanadi');

      attachFails = false;
      c.read(photoQueueProvider.notifier).retry(c.read(photoQueueProvider).single.id);
      await until(() => c.read(photoQueueProvider).single.done);
      expect(uploader.uploads, hasLength(1), reason: 'ikkinchi marta yuklanmadi');
      expect(api.paths.where((p) => p == '/itemPhotoUploadAuth'), hasLength(1));
    });

    test("joy qolmagan (409) — xato ko'rsatiladi; bekor qilinsa ImageKit'dagi fayl ham tozalanadi", () async {
      api.handler = (path, body) {
        if (path == '/itemPhotoUploadAuth') return authJson();
        if (path == '/addItemPhoto') throw const ApiException(409, 'limit', "Eski holat uchun ko'pi bilan 2 ta rasm saqlanadi");
        return const {'ok': true, 'removed': false};
      };
      final c = make();
      await ready(c);
      await add(c);
      await until(() => c.read(photoQueueProvider).single.failed);
      final op = c.read(photoQueueProvider).single;
      expect(op.error, contains('2 ta'));
      expect(File(op.localPath!).existsSync(), isTrue, reason: 'qaror xodimda');

      await c.read(photoQueueProvider.notifier).cancel(op.id);
      await until(() => c.read(photoQueueProvider).isEmpty || c.read(photoQueueProvider).single.done);
      expect(api.calls.last.$1, '/deleteItemPhoto');
      expect(api.calls.last.$2['fileId'], 'ik1');
      expect(File(op.localPath!).existsSync(), isFalse);
    });

    test("yuklanmagan rasmni bekor qilish — serverga hech narsa ketmaydi", () async {
      token = null;
      final c = make();
      await ready(c);
      await add(c);
      await until(() => !c.read(photoQueueProvider).single.sending);
      final op = c.read(photoQueueProvider).single;
      await c.read(photoQueueProvider.notifier).cancel(op.id);
      expect(c.read(photoQueueProvider), isEmpty);
      expect(File(op.localPath!).existsSync(), isFalse);
      expect(prefs.getString('photoQueue.v1.e1'), isNull);
      expect(api.calls, isEmpty);
    });

    test("o'chirish — navbat orqali, takror bosilsa bitta amal", () async {
      final c = make();
      await ready(c);
      final q = c.read(photoQueueProvider.notifier);
      q.deletePhoto(orderId: 'o1', itemId: 'i1', state: PhotoState.ready, fileId: 'F9', label: 'x');
      q.deletePhoto(orderId: 'o1', itemId: 'i1', state: PhotoState.ready, fileId: 'F9', label: 'x');
      expect(c.read(photoQueueProvider), hasLength(1));
      expect(photoSlotsOf('o1', gilam(photos: ItemPhotos(ready: [ph('F9')])), PhotoState.ready, c.read(photoQueueProvider)), isEmpty,
          reason: "ekrandan darhol yo'qoladi");
      await until(() => c.read(photoQueueProvider).single.done);
      expect(api.calls.single.$1, '/deleteItemPhoto');
      expect(api.calls.single.$2, {'orderId': 'o1', 'itemId': 'i1', 'state': 'ready', 'fileId': 'F9'});
    });

    test("ruxsat yo'q (403) — rad etiladi, qayta urinmaydi", () async {
      api.handler = (path, body) => throw const ApiException(403, 'permission-denied', "Rasm saqlash huquqingiz yo'q");
      final c = make();
      await ready(c);
      await add(c);
      await until(() => c.read(photoQueueProvider).single.failed);
      expect(c.read(photoQueueProvider).single.error, "Rasm saqlash huquqingiz yo'q");
      expect(c.read(failedPhotoOpsProvider), hasLength(1));
      expect(c.read(pendingPhotoCountProvider), 0);
      expect(uploader.uploads, isEmpty);
    });

    test('navbat xodimga bog\'langan', () async {
      token = null;
      final a = make(employeeId: 'e1');
      await ready(a);
      await add(a);
      final b = make(employeeId: 'e2');
      await ready(b);
      expect(b.read(photoQueueProvider), isEmpty);
    });

    test('kamera ilovani yopib yuborsa — rasm tiklanadi', () async {
      token = null;
      final c = make();
      await ready(c);
      await c.read(photoQueueProvider.notifier).rememberCapture(orderId: 'o1', itemId: 'i1', state: PhotoState.ready, label: 'L');
      c.dispose();
      containers.remove(c);

      picker.lost = [shot('lost.jpg').path];
      final c2 = make();
      await ready(c2);
      await until(() => c2.read(photoQueueProvider).isNotEmpty);
      final op = c2.read(photoQueueProvider).single;
      expect([op.orderId, op.itemId, op.state, op.label], ['o1', 'i1', PhotoState.ready, 'L']);
      expect(prefs.getString('photo.captureContext'), isNull);
    });
  });

  group('ekran', () {
    Future<_Api> pump(
      WidgetTester tester, {
      required Widget child,
      Map<String, dynamic> perms = _allPerms,
      List<OrderItem>? items,
      _Picker? picker,
      double width = 360,
      double scale = 1,
    }) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final dir = Directory.systemTemp.createTempSync('photo_ui_test');
      addTearDown(() {
        try {
          dir.deleteSync(recursive: true);
        } catch (_) {}
      });
      final api = _Api();
      final cache = _Cache();
      tester.view.physicalSize = Size(width * 3, 900 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(
        key: UniqueKey(),
        overrides: [
          apiClientProvider.overrideWithValue(api),
          idTokenProvider.overrideWithValue(() async => null),
          localStoreProvider.overrideWithValue(LocalStore(prefs)),
          employeeClaimsProvider.overrideWith((ref) async => const EmployeeClaims(employeeId: 'e1', role: 'worker', department: 'worker')),
          currentEmployeeProvider.overrideWith((ref) => Stream.value(perms)),
          connectivityProvider.overrideWith((ref) => Stream.value(true)),
          actionQueueProvider.overrideWith(_NoActions.new),
          if (items != null) orderItemsProvider.overrideWith((ref, id) => AsyncData(items)),
          photoUploaderProvider.overrideWithValue(_Uploader()),
          photoPickerProvider.overrideWithValue(picker ?? _Picker()),
          photoStorageDirProvider.overrideWith((ref) async => dir),
          photoCachesProvider.overrideWithValue(PhotoCaches(thumbs: cache, full: cache)),
        ],
        child: MaterialApp(
          builder: (context, c) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
            child: c!,
          ),
          home: Scaffold(body: child),
        ),
      ));
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets("belgi: vakolatsiz — yo'q; faqat saqlash — \"Rasm qo'shish\"; rasmlar soni", (tester) async {
      final withPhotos = gilam(photos: ItemPhotos(before: [ph('a'), ph('b')], ready: [ph('c')]));
      await pump(tester, perms: const {}, child: ItemPhotosChip(orderId: 'o1', item: withPhotos, subId: '1245/2'));
      expect(find.byType(InkWell), findsNothing);

      await pump(tester, perms: const {'canUploadPhotos': true}, child: ItemPhotosChip(orderId: 'o1', item: gilam(), subId: '1245/2'));
      expect(find.text("Rasm qo'shish"), findsOneWidget);

      await pump(tester, perms: const {'canViewPhotos': true}, child: ItemPhotosChip(orderId: 'o1', item: gilam(), subId: '1245/2'));
      expect(find.byType(InkWell), findsNothing, reason: "ko'rish huquqi bor, lekin rasm yo'q");

      await pump(tester, perms: const {'canViewPhotos': true}, child: ItemPhotosChip(orderId: 'o1', item: withPhotos, subId: '1245/2'));
      expect(find.text('Eski 2 · Tayyor 1'), findsOneWidget);
    });

    testWidgets("oyna: holatlar, 1/2, qo'shish; kameradan olingan rasm darhol ko'rinadi", (tester) async {
      final picker = _Picker();
      final item = gilam(photos: ItemPhotos(before: [ph('a', by: 'Vali')]));
      await pump(tester, picker: picker, items: [item], child: ItemPhotosSheet(orderId: 'o1', item: item, subId: '1245/2'));

      expect(find.text('Eski holati'), findsOneWidget);
      expect(find.text('Tayyor holati'), findsOneWidget);
      expect(find.text('1/2'), findsOneWidget);
      expect(find.text('0/2'), findsOneWidget);
      expect(find.text("Rasm qo'shish"), findsNWidgets(2));

      final shot = await tester.runAsync(() async {
        final f = File('${Directory.systemTemp.path}/ui_shot_${DateTime.now().microsecondsSinceEpoch}.jpg');
        await f.writeAsBytes(List.filled(100, 1));
        return f;
      });
      picker.result = [shot!.path];
      await tester.tap(find.text("Rasm qo'shish").first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kamera'));
      // Fayldan nusxa olish va navbat — haqiqiy fayl tizimi bilan.
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 80)));
      }
      await tester.pump(const Duration(milliseconds: 400));

      expect(picker.requests.single, (true, 1), reason: 'faqat qolgan joy soni');
      expect(find.text('2/2'), findsOneWidget);
      expect(find.text('Navbatda'), findsOneWidget);
      expect(find.text("Rasm qo'shish"), findsOneWidget, reason: "eski holat to'ldi");
    });

    testWidgets("ko'rish huquqisiz — rasm bor, lekin ochilmaydi va yuklanmaydi", (tester) async {
      final item = gilam(photos: ItemPhotos(before: [ph('a')]));
      await pump(tester, perms: const {'canUploadPhotos': true}, items: [item], child: ItemPhotosSheet(orderId: 'o1', item: item, subId: '1245/2'));
      expect(find.text('Rasm bor'), findsOneWidget);
      expect(find.byTooltip("O'chirish"), findsNothing);
      expect(find.bySemanticsLabel("O'chirish"), findsNothing);
    });

    testWidgets("o'chirish: tasdiqlangach katakdan darhol yo'qoladi", (tester) async {
      final item = gilam(photos: ItemPhotos(before: [ph('a')], ready: [ph('b')]));
      await pump(tester, items: [item], child: ItemPhotosSheet(orderId: 'o1', item: item, subId: '1245/2'));
      await tester.tap(find.bySemanticsLabel("O'chirish").first);
      await tester.pumpAndSettle();
      expect(find.text("Rasmni o'chirasizmi?"), findsOneWidget);
      await tester.tap(find.text("O'chirish"));
      await tester.pumpAndSettle();
      expect(find.text('0/2'), findsOneWidget);
      expect(find.text('1/2'), findsOneWidget);
    });

    for (final (width, scale) in [(320.0, 1.3), (412.0, 1.0)]) {
      testWidgets('toshib ketmaydi: ${width.toInt()}px · ${scale}x', (tester) async {
        final item = gilam(photos: ItemPhotos(before: [ph('a'), ph('b')], ready: [ph('c')]));
        await pump(tester, width: width, scale: scale, items: [item], child: ItemPhotosSheet(orderId: 'o1', item: item, subId: '12345/12'));
        expect(tester.takeException(), isNull);
        await pump(
          tester,
          width: width,
          scale: scale,
          child: ListView(children: [
            ItemDetailRow(orderId: 'o1', item: item, subId: '12345/12', editable: true),
            ItemDetailRow(orderId: 'o1', item: gilam(), subId: '12345/13'),
          ]),
        );
        expect(find.text('Eski 2 · Tayyor 1'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  });
}

class _NoActions extends ActionQueue {
  @override
  List<PendingAction> build() => const [];
}

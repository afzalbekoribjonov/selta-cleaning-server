import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/services/api_client.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/connectivity_service.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/sync/action_queue.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Serverni almashtiradi: har bir yo'l uchun navbatdagi javob yoki xato.
class FakeApi extends ApiClient {
  final calls = <String>[];
  final bodies = <Map<String, dynamic>>[];
  final responses = <Object>[];

  @override
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body, String? idToken}) async {
    calls.add(path);
    bodies.add(body ?? const {});
    if (responses.isEmpty) return const {'ok': true};
    final next = responses.removeAt(0);
    if (next is Exception) throw next;
    return next as Map<String, dynamic>;
  }
}

/// Navbat taymer orqali ishga tushadi — bir necha aylanish kutamiz.
Future<void> settle() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

PendingAction act(String path, {String? orderId}) {
  final id = newActionId();
  return PendingAction(
    id: id,
    path: path,
    body: {'actionId': id},
    orderId: orderId,
    effect: const {'kind': 'none'},
    label: path,
    createdAt: DateTime.now(),
  );
}

void main() {
  late FakeApi api;
  late LocalStore store;
  late StreamController<bool> network;

  Future<ProviderContainer> makeContainer({String employeeId = 'emp1'}) async {
    final container = ProviderContainer(
      overrides: [
        localStoreProvider.overrideWithValue(store),
        apiClientProvider.overrideWithValue(api),
        idTokenProvider.overrideWithValue(() async => 'token'),
        employeeClaimsProvider.overrideWith(
          (ref) async => EmployeeClaims(employeeId: employeeId, role: 'delivery', department: 'delivery'),
        ),
        connectivityProvider.overrideWith((ref) => network.stream),
      ],
    );
    addTearDown(container.dispose);
    // Navbat xodim aniqlangach o'zini yuklaydi.
    container.listen(actionQueueProvider, (_, __) {});
    await container.read(employeeClaimsProvider.future);
    await settle();
    return container;
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store = await LocalStore.open();
    api = FakeApi();
    network = StreamController<bool>.broadcast();
    addTearDown(network.close);
  });

  test('amal yuboriladi va qabul qilingach "acked" bo\'ladi', () async {
    final c = await makeContainer();
    final a = act('/changeItemStatus');
    c.read(actionQueueProvider.notifier).enqueue(a);
    await settle();

    expect(api.calls, ['/changeItemStatus']);
    expect(api.bodies.single['actionId'], a.id, reason: 'server takrorni shu ID bo\'yicha taniydi');
    expect(c.read(actionQueueProvider).single.acked, isTrue);
    expect(c.read(pendingActionCountProvider), 0);
  });

  test('amallar TARTIB BILAN yuboriladi', () async {
    final c = await makeContainer();
    final q = c.read(actionQueueProvider.notifier);
    q.enqueue(act('/a'));
    q.enqueue(act('/b'));
    q.enqueue(act('/c'));
    await settle();
    expect(api.calls, ['/a', '/b', '/c']);
  });

  test('internet yo\'q — amal navbatda qoladi va qurilmaga saqlanadi', () async {
    api.responses.add(const ApiException(0, 'unavailable', "Serverga ulanib bo'lmadi"));
    final c = await makeContainer();
    final a = act('/deliverOrderItems');
    c.read(actionQueueProvider.notifier).enqueue(a);
    await settle();

    final queued = c.read(actionQueueProvider).single;
    expect(queued.failed, isFalse);
    expect(queued.acked, isFalse);
    expect(queued.attempts, 1);
    expect(c.read(pendingActionCountProvider), 1);

    final saved = jsonDecode(store.getString('outbox.v1.emp1')!) as List;
    expect(saved.single['id'], a.id);
  });

  test('ilova qayta ochilsa navbat tiklanadi va yuboriladi', () async {
    api.responses.add(const ApiException(0, 'unavailable', 'x'));
    final first = await makeContainer();
    final a = act('/changeOrderStatus');
    first.read(actionQueueProvider.notifier).enqueue(a);
    await settle();
    first.dispose();

    // "Qayta ochildi" — endi server javob beradi.
    final second = await makeContainer();
    await settle();
    expect(api.calls, ['/changeOrderStatus', '/changeOrderStatus']);
    expect(second.read(actionQueueProvider).single.acked, isTrue);
  });

  test('internet qaytishi bilan darhol qayta yuboriladi', () async {
    api.responses.add(const ApiException(0, 'unavailable', 'x'));
    final c = await makeContainer();
    c.read(actionQueueProvider.notifier).enqueue(act('/x'));
    await settle();
    expect(api.calls.length, 1);

    network.add(false);
    await settle();
    network.add(true);
    await settle();
    expect(api.calls.length, 2);
    expect(c.read(actionQueueProvider).single.acked, isTrue);
  });

  test('server rad etsa "bajarilmadi" bo\'ladi, keyingilari baribir yuboriladi', () async {
    api.responses.add(const ApiException(412, 'failed-precondition', 'Mahsulot yetkazishga tayyor emas'));
    final c = await makeContainer();
    final q = c.read(actionQueueProvider.notifier);
    q.enqueue(act('/bad'));
    q.enqueue(act('/good'));
    await settle();

    expect(api.calls, ['/bad', '/good']);
    final failed = c.read(failedActionsProvider).single;
    expect(failed.error, 'Mahsulot yetkazishga tayyor emas');
    expect(c.read(actionQueueProvider).last.acked, isTrue);
  });

  test('server hali bajarayotgan bo\'lsa (409 in-progress) — keyinroq qayta urinadi', () async {
    api.responses.add(const ApiException(409, 'in-progress', 'Amal hali bajarilmoqda'));
    final c = await makeContainer();
    c.read(actionQueueProvider.notifier).enqueue(act('/x'));
    await settle();
    expect(c.read(actionQueueProvider).single.failed, isFalse);
  });

  test('5xx vaqtinchalik — rad etilgan deb belgilanmaydi', () async {
    api.responses.add(const ApiException(500, 'internal', 'Server xatoligi'));
    final c = await makeContainer();
    c.read(actionQueueProvider.notifier).enqueue(act('/x'));
    await settle();
    expect(c.read(failedActionsProvider), isEmpty);
    expect(c.read(pendingActionCountProvider), 1);
  });

  test('qayta urinish va bekor qilish', () async {
    api.responses.add(const ApiException(403, 'permission-denied', "Ruxsat yo'q"));
    final c = await makeContainer();
    final q = c.read(actionQueueProvider.notifier);
    final a = act('/x');
    q.enqueue(a);
    await settle();
    expect(c.read(failedActionsProvider).length, 1);

    q.retry(a.id);
    await settle();
    expect(c.read(failedActionsProvider), isEmpty);
    expect(c.read(actionQueueProvider).single.acked, isTrue);

    final b = act('/y');
    api.responses.add(const ApiException(403, 'permission-denied', 'x'));
    q.enqueue(b);
    await settle();
    q.discard(b.id);
    expect(c.read(actionQueueProvider).where((x) => x.id == b.id), isEmpty);
  });

  test('server javobi kutiladi (yangi buyurtma raqami)', () async {
    api.responses.add(const {'orderId': 'o1', 'orderNumber': 1245});
    final c = await makeContainer();
    final q = c.read(actionQueueProvider.notifier);
    final a = act('/createOrder');
    q.enqueue(a);
    final result = await q.resultOf(a.id, const Duration(seconds: 2));
    expect(result?['orderNumber'], 1245);
  });

  test('navbat XODIMGA bog\'langan — boshqa xodim nomidan yuborilmaydi', () async {
    api.responses.add(const ApiException(0, 'unavailable', 'x'));
    final first = await makeContainer(employeeId: 'emp1');
    first.read(actionQueueProvider.notifier).enqueue(act('/x'));
    await settle();
    first.dispose();

    final other = await makeContainer(employeeId: 'emp2');
    await settle();
    expect(other.read(actionQueueProvider), isEmpty);
    expect(api.calls.length, 1, reason: 'emp1 ning amali emp2 tokeni bilan yuborilmasligi kerak');
  });
}

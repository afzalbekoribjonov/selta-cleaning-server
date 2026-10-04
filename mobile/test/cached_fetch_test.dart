import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/services/local_store.dart';
import 'package:selta_cleaning/core/sync/cached_fetch.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late LocalStore store;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store = await LocalStore.open();
  });

  test('muvaffaqiyatli javob qaytadi va saqlanadi', () async {
    final data = await fetchWithCache(store, 'k', () async => {'n': 1}, usable: savedToday);
    expect(data, {'n': 1});
    expect(store.getJson('k')?['data'], {'n': 1});
  });

  test('internetsiz — saqlangan nusxa', () async {
    await fetchWithCache(store, 'k', () async => {'n': 1}, usable: savedToday);
    final data = await fetchWithCache(store, 'k', () async => throw Exception('offline'), usable: savedToday);
    expect(data, {'n': 1});
  });

  test('eskirgan nusxa ishlatilmaydi — xato chiqadi', () async {
    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    await store.setJson('k', {'savedAt': yesterday.millisecondsSinceEpoch, 'data': {'n': 1}});
    expect(
      () => fetchWithCache(store, 'k', () async => throw Exception('offline'), usable: savedToday),
      throwsException,
    );
  });

  test('nusxa umuman yo\'q — xato chiqadi', () async {
    expect(
      () => fetchWithCache(store, 'k', () async => throw Exception('offline'), usable: savedToday),
      throwsException,
    );
  });
}

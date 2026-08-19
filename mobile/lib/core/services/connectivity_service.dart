import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

bool _hasConnection(List<ConnectivityResult> results) {
  return results.any((r) => r != ConnectivityResult.none);
}

/// Qurilmaning tarmoq interfeysi holati (wifi/mobil/aloqasiz) — talab #1:
/// FAQAT haqiqiy "internet yo'q" holatida to'liq "Qayta urinish" ekrani
/// ko'rsatiladi, boshqa har qanday vaqt ilova faol ishlab turadi. Bu
/// Firestore'ning o'z avtomatik qayta ulanish/offline keshi bilan
/// aralashmaydi — faqat qurilma darajasidagi tarmoq bor/yo'qligini bildiradi.
/// Boshlang'ich holatni darhol beradi (`checkConnectivity`), keyin oqimga
/// ulanadi — shu bilan ilova ochilishida "bir lahza noto'g'ri holat"
/// ko'rinishining oldi olinadi.
final connectivityProvider = StreamProvider<bool>((ref) async* {
  yield _hasConnection(await Connectivity().checkConnectivity());
  yield* Connectivity().onConnectivityChanged.map(_hasConnection);
});

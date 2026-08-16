import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'auth_service.dart';

/// Xodim tizimga kirgach qurilma FCM tokenini serverga yuboradi — server
/// shu token orqali push-bildirishnoma jo'natadi (masalan, yangi buyurtma,
/// QC rad etishi). Token yangilanganda ham qayta yuboriladi.
class FcmService {
  final ApiClient _api;
  FcmService(this._api);

  Future<void> registerDevice() async {
    final messaging = FirebaseMessaging.instance;

    final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      return;
    }

    final token = await messaging.getToken();
    if (token != null) {
      await _sendToken(token);
    }

    messaging.onTokenRefresh.listen(_sendToken);
  }

  Future<void> _sendToken(String token) async {
    try {
      final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (idToken == null) return;
      await _api.post('/updateFcmToken', idToken: idToken, body: {'fcmToken': token});
    } catch (_) {
      // Token yuborilmasa ham ilova ishlashda davom etadi — push shunchaki
      // shu qurilmaga kelmaydi, funksionallikka ta'sir qilmaydi.
    }
  }
}

final fcmServiceProvider = Provider<FcmService>((ref) => FcmService(ref.watch(apiClientProvider)));

/// `employeeId` bo'yicha bir marta ishga tushiriladi — xodim tizimga
/// kirgach FCM ro'yxatdan o'tishini boshlaydi, keyingi rebuild'larda
/// qayta chaqirilmaydi.
final fcmRegistrationProvider = FutureProvider.family<void, String>((ref, employeeId) {
  return ref.watch(fcmServiceProvider).registerDevice();
});

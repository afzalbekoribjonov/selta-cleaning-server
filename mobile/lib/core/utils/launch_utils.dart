import 'package:url_launcher/url_launcher.dart';

/// Mijozga qo'ng'iroq qilish — telefon ilovasini ochadi, raqamni to'ldiradi.
Future<void> callPhone(String phone) async {
  final uri = Uri(scheme: 'tel', path: phone);
  await launchUrl(uri);
}

/// Saqlangan GPS ("lat,lng") ga Google Xaritalar orqali marshrut ochadi.
Future<void> navigateToGps(String gpsCoords) async {
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$gpsCoords&travelmode=driving');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

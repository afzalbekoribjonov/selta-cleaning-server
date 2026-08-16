/// Backend server manzili (Render'da joylashgan Express server —
/// firebase/functions/ o'rnini bosdi, Blaze rejasi shart bo'lmasligi
/// uchun). Standart qiymat — haqiqiy production server, shuning uchun
/// oddiy `flutter build apk` ham to'g'ri manzilga ulanadi. Faqat lokal
/// emulyatorda serverni ham o'zingizda ishga tushirib test qilmoqchi
/// bo'lsangina almashtiring:
///   flutter run --dart-define=SERVER_BASE_URL=http://localhost:8080
const String kServerBaseUrl = String.fromEnvironment(
  'SERVER_BASE_URL',
  defaultValue: 'https://selta-cleaning-server.onrender.com',
);

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

/// Admin panel (WebView) tugmasi shu build'da bo'ladimi.
///
/// SUKUT BO'YICHA O'CHIQ — oddiy `flutter build apk` da tugma umuman
/// yo'q, chunki u xodimlarga ko'rinmasligi kerak. Faqat admin uchun
/// mo'ljallangan buildda yoqiladi:
///   flutter build apk --release --dart-define=ADMIN_PANEL=true
///
/// Tugmaning o'zi ham yashirin: bo'lim tanlash ekranidagi logotipni
/// bosib turish orqali ochiladi (role_select_screen.dart).
const bool kAdminPanelEnabled = bool.fromEnvironment('ADMIN_PANEL');

/// Admin panel manzili — WebView shu sahifani ochadi. Kirish o'sha
/// yerdagi odatdagi email/parol formasi orqali; sessiya WebView'ning
/// o'z xotirasida (IndexedDB) saqlanadi, shuning uchun keyingi
/// ochilishlarda qayta login talab qilinmaydi.
const String kAdminPanelUrl = String.fromEnvironment(
  'ADMIN_PANEL_URL',
  defaultValue: 'https://admin.seltacleaning.uz',
);

/// Backend server manzili (Render'da joylashgan Express server —
/// firebase/functions/ o'rnini bosdi, Blaze rejasi shart bo'lmasligi
/// uchun). Build paytida almashtiriladi:
///   flutter run --dart-define=SERVER_BASE_URL=https://selta-cleaning-server.onrender.com
const String kServerBaseUrl = String.fromEnvironment(
  'SERVER_BASE_URL',
  defaultValue: 'http://localhost:8080',
);

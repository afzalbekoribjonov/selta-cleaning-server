import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/router.dart';
import 'app/theme.dart';
import 'core/services/local_store.dart';
import 'core/widgets/attendance_gate.dart';
import 'core/widgets/connectivity_gate.dart';
import 'firebase_options.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase va mahalliy xotira BIR VAQTDA ochiladi — ketma-ket kutish
  // startni keraksiz cho'zardi.
  final results = await Future.wait([
    Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform),
    LocalStore.open(),
  ]);
  final store = results[1] as LocalStore;

  // Kesh CHEKLANMAGAN: standart (~40 MB) to'lganda Firestore eski
  // hujjatlarni o'chiradi va internetsiz ochilganda ular yo'qolib
  // qolardi. Sozlama har qanday Firestore so'rovidan OLDIN berilishi shart.
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: true,
    cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
  );

  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.dark);
  runApp(
    ProviderScope(
      overrides: [localStoreProvider.overrideWithValue(store)],
      child: const SeltaCleaningApp(),
    ),
  );
}

class SeltaCleaningApp extends StatelessWidget {
  const SeltaCleaningApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Selta Cleaning',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      themeMode: ThemeMode.light,
      routerConfig: appRouter,
      // O'zbekcha: kalendar (sana tanlash), standart dialog va matn
      // tanlash tugmalari xodimga tushunarli tilda chiqadi.
      locale: const Locale('uz'),
      supportedLocales: const [Locale('uz')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      builder: (context, child) => ConnectivityGate(child: AttendanceGate(child: child)),
    );
  }
}

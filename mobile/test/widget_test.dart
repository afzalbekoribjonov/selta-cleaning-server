import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/main.dart';

void main() {
  testWidgets('App boots and shows the splash screen', (WidgetTester tester) async {
    // Haqiqiy Firebase'ga ulanmaslik uchun auth holati o'rniga sodda
    // qiymat (signed-out) beriladi — bu test faqat ilova qulamasdan
    // ishga tushishini tekshiradi.
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith((ref) => Stream<User?>.value(null)),
        ],
        child: const SeltaCleaningApp(),
      ),
    );
    await tester.pump();

    expect(find.text('SELTA CLEANING'), findsOneWidget);

    // Splash screen auth holati aniqlangach navigatsiya qiladi — shu
    // jarayon to'liq tugashi uchun pump qilinadi, aks holda test tugashida
    // pending timer qoladi.
    await tester.pump(const Duration(milliseconds: 600));
  });
}

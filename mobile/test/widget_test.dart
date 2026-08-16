import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:selta_cleaning/main.dart';

void main() {
  testWidgets('App boots and shows the splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: SeltaCleaningApp()));
    await tester.pump();

    expect(find.text('SELTA CLEANING'), findsOneWidget);

    // Splash screen schedules a navigation timer; let it fire so no timer
    // is left pending when the test tears down.
    await tester.pump(const Duration(milliseconds: 1500));
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/widgets/uz_date_range_sheet.dart';

void main() {
  group('sana matni va oy oralig\'i', () {
    test('formatUzRange', () {
      expect(formatUzRange(DateTimeRange(start: DateTime(2026, 11, 3), end: DateTime(2026, 11, 3))), '3-noyabr');
      expect(formatUzRange(DateTimeRange(start: DateTime(2026, 11, 3), end: DateTime(2026, 11, 19))), '3–19-noyabr');
      expect(formatUzRange(DateTimeRange(start: DateTime(2026, 10, 28), end: DateTime(2026, 11, 3))), '28-oktabr – 3-noyabr');
    });

    test('monthRangeOf: o\'tgan oy to\'liq, joriy oy — bugungacha, kabisa fevral', () {
      final now = DateTime(2026, 11, 19, 15);
      final past = monthRangeOf(DateTime(2026, 10), now: now);
      expect(past.start, DateTime(2026, 10, 1));
      expect(past.end, DateTime(2026, 10, 31));
      final current = monthRangeOf(DateTime(2026, 11), now: now);
      expect(current.end, DateTime(2026, 11, 19));
      expect(monthRangeOf(DateTime(2028, 2), now: DateTime(2028, 5, 1)).end, DateTime(2028, 2, 29));
    });
  });

  testWidgets("tayyor davr tugmasi — darhol tanlanadi (320px, katta shrift)", (tester) async {
    DateTimeRange? picked;
    tester.view.physicalSize = const Size(320 * 3, 760 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.3)),
        child: child!,
      ),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async => picked = await showUzDateRangeSheet(context),
              child: const Text('Ochish'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('Ochish'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Davrni tanlang'), findsOneWidget);

    await tester.tap(find.text('Kecha'));
    await tester.pumpAndSettle();
    final now = DateTime.now();
    final yesterday = DateTime(now.year, now.month, now.day - 1);
    expect(picked, isNotNull);
    expect(picked!.start, yesterday);
    expect(picked!.end, yesterday);
  });

  testWidgets("kalendardan kun tanlab 'Tanlash' — bir kunlik oraliq; kelajak kuni bosilmaydi", (tester) async {
    DateTimeRange? picked;
    tester.view.physicalSize = const Size(360 * 3, 800 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async => picked = await showUzDateRangeSheet(context),
              child: const Text('Ochish'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('Ochish'));
    await tester.pumpAndSettle();

    final now = DateTime.now();
    final lastDay = DateTime(now.year, now.month + 1, 0).day;
    if (now.day < lastDay) {
      // Ertangi kun — tanlanmaydi.
      await tester.tap(find.text('${now.day + 1}').last, warnIfMissed: false);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('1').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Tanlash'));
    await tester.tap(find.text('Tanlash'));
    await tester.pumpAndSettle();
    expect(picked, isNotNull);
    expect(picked!.start, DateTime(now.year, now.month, 1));
    expect(picked!.end, DateTime(now.year, now.month, 1));
  });
}

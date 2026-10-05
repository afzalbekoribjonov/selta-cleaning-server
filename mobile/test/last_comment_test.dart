import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/sync/overlay.dart';
import 'package:selta_cleaning/core/sync/pending_action.dart';
import 'package:selta_cleaning/features/dispatcher/widgets/order_card.dart';

Order withComment(String? text, {String author = 'Sotuv menejeri Dilnoza'}) => Order(
      id: 'o1',
      orderNumber: 1245,
      customerName: 'Aziz Karimov',
      phone: '+998901234567',
      location: 'Yunusobod',
      serviceType: 'pickup',
      status: 'new',
      createdBy: 'e',
      createdAt: DateTime(2026, 10, 1),
      lastCommentText: text,
      lastCommentAuthor: author,
      lastCommentAt: DateTime(2026, 10, 2),
    );

Future<void> pump(WidgetTester tester, Widget child, {double width = 320, double scale = 1}) async {
  tester.view.physicalSize = Size(width * 3, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 800), textScaler: TextScaler.linear(scale)),
        child: Scaffold(body: ListView(children: [child])),
      ),
    ),
  );
}

void main() {
  const long = "3-qavat, lift ishlamaydi.\nMijoz faqat kechqurun soat 19:00 dan keyin uyda bo'ladi, oldindan qo'ng'iroq qilish shart";

  testWidgets('izoh bir qatorda, ko\'p qatorli uzun matn ham toshmaydi', (tester) async {
    await pump(tester, OrderCard(order: withComment(long), onTap: () {}));
    expect(tester.takeException(), isNull);
    final text = tester.widget<Text>(find.byWidgetPredicate((w) => w is Text && w.textSpan != null && w.maxLines == 1 && w.textSpan!.toPlainText().contains('lift')));
    expect(text.overflow, TextOverflow.ellipsis);
    // Yangi qatorlar bitta bo'shliqqa aylanadi — bir qator buzilmaydi.
    expect(text.textSpan!.toPlainText(), isNot(contains('\n')));
  });

  testWidgets('katta shriftda (1.3x) ham toshmaydi', (tester) async {
    await pump(tester, OrderCard(order: withComment(long), onTap: () {}), width: 360, scale: 1.3);
    expect(tester.takeException(), isNull);
  });

  testWidgets('izohsiz buyurtmada qator chiqmaydi', (tester) async {
    await pump(tester, OrderCard(order: withComment(null), onTap: () {}));
    expect(find.byIcon(Icons.chat_bubble_rounded), findsNothing);
    await pump(tester, OrderCard(order: withComment('   '), onTap: () {}));
    expect(find.byIcon(Icons.chat_bubble_rounded), findsNothing);
  });

  testWidgets('izoh bosilsa izohga o\'tadi, karta bosilsa oddiy ochiladi', (tester) async {
    var card = 0, comment = 0;
    await pump(
      tester,
      OrderCard(order: withComment('Lift yo\'q'), onTap: () => card++, onCommentTap: () => comment++),
      width: 412,
    );
    await tester.tap(find.byIcon(Icons.chat_bubble_rounded));
    expect((card, comment), (0, 1));
    await tester.tap(find.text('Aziz Karimov'));
    expect((card, comment), (1, 1));
  });

  test('oflayn yozilgan izoh kartada darhol ko\'rinadi', () {
    final action = PendingAction(
      id: newActionId(),
      path: '/setLastComment',
      body: const {},
      orderId: 'o1',
      effect: {
        'kind': EffectKind.orderUpdate,
        'fields': {
          'lastCommentText': 'Yangi izoh',
          'lastCommentAuthor': 'Ali',
          'lastCommentAt': DateTime(2026, 10, 5).millisecondsSinceEpoch,
        },
      },
      label: '',
      createdAt: DateTime.now(),
    );
    final out = applyToOrders([withComment('Eski')], [action]).single;
    expect(out.lastCommentText, 'Yangi izoh');
    expect(out.lastCommentAuthor, 'Ali');
    expect(out.lastCommentAt, DateTime(2026, 10, 5));
  });
}

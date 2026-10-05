import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selta_cleaning/core/models/employee_summary.dart';
import 'package:selta_cleaning/core/models/order.dart';
import 'package:selta_cleaning/core/models/order_item.dart';
import 'package:selta_cleaning/core/services/auth_service.dart';
import 'package:selta_cleaning/core/services/catalog_repository.dart';
import 'package:selta_cleaning/core/services/customer_search.dart';
import 'package:selta_cleaning/core/services/employee_repository.dart';
import 'package:selta_cleaning/core/services/orders_repository.dart';
import 'package:selta_cleaning/core/services/tariff_settings.dart';
import 'package:selta_cleaning/features/dispatcher/new_order_tab.dart';
import 'package:selta_cleaning/features/search/global_search_screen.dart';

Order past(String id, DateTime createdAt, {String name = 'Aziz Karimov', String location = 'Yunusobod 4-12', String? gps}) =>
    Order(
      id: id,
      orderNumber: 1000 + createdAt.day,
      customerName: name,
      phone: '+998901234567',
      location: location,
      gpsCoords: gps,
      serviceType: 'pickup',
      status: 'done',
      createdBy: 'e',
      createdAt: createdAt,
    );

class _FakeSearch implements CustomerSearch {
  final Map<String, CustomerResult> customers = {};
  bool offline = false;
  final calls = <String>[];

  /// Berilsa javob shu tugaguncha kechiktiriladi (kech kelgan javob testi).
  Completer<void>? gate;

  @override
  Future<({CustomerResult? customer, bool fromCache})> lookupPhone(String digits) async {
    calls.add(digits);
    if (gate != null) await gate!.future;
    return (customer: customers[digits], fromCache: offline);
  }

  @override
  Future<CustomerResult?> byPhone(String digits) async => customers[digits];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _CreateCall {
  final String customerName;
  final String location;
  final String? gpsCoords;
  final bool gpsChecked;
  const _CreateCall(this.customerName, this.location, this.gpsCoords, this.gpsChecked);
}

class _FakeRepo extends OrdersRepository {
  final List<_CreateCall> created;
  _FakeRepo(super.ref, this.created);

  @override
  Future<({String orderId, int orderNumber})> createOrder({
    required String customerName,
    required String phone,
    required String location,
    required String serviceType,
    String? tariff,
    String? gpsCoords,
    bool gpsChecked = false,
    List<CatalogItemDraft>? items,
    List<String>? notedItems,
    num? estimatedPrice,
    String? source,
    bool? walkIn,
    String? actorName,
  }) async {
    created.add(_CreateCall(customerName, location, gpsCoords, gpsChecked));
    return (orderId: 'new', orderNumber: 1300);
  }
}

void main() {
  late _FakeSearch search;
  late List<_CreateCall> created;

  setUp(() {
    search = _FakeSearch();
    created = [];
    final orders = [
      past('a', DateTime(2026, 9, 20), gps: '41.3601,69.2851'),
      past('b', DateTime(2025, 3, 1), name: 'Aziz', location: 'Eski manzil', gps: '41.1,69.1'),
    ];
    search.customers['901234567'] =
        CustomerResult(phone: '+998901234567', customerName: 'Aziz Karimov', orders: orders);
  });

  Future<void> pumpForm(WidgetTester tester, {double width = 360, double scale = 1}) async {
    tester.view.physicalSize = Size(width * 3, 1800 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          customerSearchProvider.overrideWithValue(search),
          ordersRepositoryProvider.overrideWith((ref) => _FakeRepo(ref, created)),
          orderSourcesProvider.overrideWith((ref) => Stream.value(const [])),
          tariffSettingsProvider.overrideWith((ref) => Stream.value(kDefaultTariffs)),
          currentEmployeeProvider.overrideWith((ref) => Stream.value({'fullName': 'Dilnoza', 'department': 'dispatcher'})),
          employeeClaimsProvider.overrideWith(
            (ref) async => const EmployeeClaims(employeeId: 'e1', role: 'dispatcher', department: 'dispatcher'),
          ),
        ],
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: Scaffold(body: NewOrderTab(onSaved: () {})),
        ),
      ),
    );
    await tester.pump();
  }

  final phone = find.byType(TextFormField).at(0);
  final name = find.byType(TextFormField).at(1);
  final location = find.byType(TextFormField).at(2);
  String textOf(WidgetTester tester, Finder f) => tester.widget<TextFormField>(f).controller!.text;

  Future<void> typePhone(WidgetTester tester, String digits) async {
    await tester.enterText(phone, digits);
    await tester.pump();
    await tester.pump();
  }

  Future<void> submitOnsite(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Joyida yuvish'));
    await tester.tap(find.text('Joyida yuvish'));
    await tester.pump();
    await tester.ensureVisible(find.text('TASDIQLASH'));
    await tester.tap(find.text('TASDIQLASH'));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('telefon birinchi, mijoz topilsa ism/manzil/GPS to\'ldiriladi', (tester) async {
    await pumpForm(tester);
    expect(tester.getTopLeft(find.text('Telefon raqam')).dy, lessThan(tester.getTopLeft(find.text('Ism familiya')).dy));

    await typePhone(tester, '901234567');
    expect(search.calls, ['901234567']);
    expect(find.text("Bu mijozga oldin ham xizmat ko'rsatilgan"), findsOneWidget);
    expect(find.textContaining('2 ta buyurtma'), findsOneWidget);
    expect(textOf(tester, name), 'Aziz Karimov', reason: "eng so'nggi buyurtmadagi ism");
    expect(textOf(tester, location), 'Yunusobod 4-12');
    expect(find.text('GPS avvalgi buyurtmadan'), findsOneWidget);

    await submitOnsite(tester);
    expect(created.single.gpsCoords, '41.3601,69.2851');
    expect(created.single.gpsChecked, isTrue);
  });

  testWidgets('kichik ekran va katta shriftda toshmaydi', (tester) async {
    await pumpForm(tester, width: 320, scale: 1.3);
    await typePhone(tester, '901234567');
    expect(find.text("Bu mijozga oldin ham xizmat ko'rsatilgan"), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('raqam almashsa avtomatik yozilganlar tozalanadi, xodim yozgani qoladi', (tester) async {
    await pumpForm(tester);
    await typePhone(tester, '901234567');
    expect(textOf(tester, name), 'Aziz Karimov');

    // Manzilni xodim o'zi o'zgartirdi — unga tegilmasligi kerak.
    await tester.enterText(location, 'Chilonzor 9');
    await tester.pump();

    await typePhone(tester, '90123456');
    expect(find.text("Bu mijozga oldin ham xizmat ko'rsatilgan"), findsNothing);
    expect(textOf(tester, name), '', reason: 'boshqa mijozga eski ism qolmasin');
    expect(textOf(tester, location), 'Chilonzor 9');
  });

  testWidgets('oldindan yozilgan ism ustidan yozilmaydi', (tester) async {
    await pumpForm(tester);
    await tester.enterText(name, 'Aziz aka');
    await typePhone(tester, '901234567');
    expect(textOf(tester, name), 'Aziz aka');
    expect(textOf(tester, location), 'Yunusobod 4-12');
  });

  testWidgets('manzil o\'zgartirilsa eski GPS yuborilmaydi', (tester) async {
    await pumpForm(tester);
    await typePhone(tester, '901234567');
    await tester.enterText(location, 'Yangi uy, Sergeli');
    await tester.pump();
    expect(find.text('GPS avvalgi buyurtmadan'), findsNothing);

    await submitOnsite(tester);
    expect(created.single.gpsCoords, isNull);
    expect(created.single.gpsChecked, isTrue, reason: "server ham eski GPS'ni ko'chirmasin");
  });

  testWidgets('GPS ni olib tashlash mumkin', (tester) async {
    await pumpForm(tester);
    await typePhone(tester, '901234567');
    await tester.tap(find.byTooltip('GPS ni olib tashlash'));
    await tester.pump();
    expect(find.text('GPS avvalgi buyurtmadan'), findsNothing);
    await submitOnsite(tester);
    expect((created.single.gpsCoords, created.single.gpsChecked), (null, true));
  });

  testWidgets('yangi mijoz va internetsiz holat', (tester) async {
    await pumpForm(tester);
    await typePhone(tester, '991112233');
    expect(find.textContaining('Yangi mijoz'), findsOneWidget);
    expect(textOf(tester, name), '');

    search.offline = true;
    await typePhone(tester, '99111223');
    await typePhone(tester, '991112234');
    expect(find.textContaining("Internet yo'q"), findsOneWidget);

    // Tekshirilmagan — GPS qarorini server qiladi.
    await tester.enterText(name, 'Vali');
    await tester.enterText(location, 'Olmazor');
    await submitOnsite(tester);
    expect(created.single.gpsChecked, isFalse);

    // Internet qaytdi — qayta tekshirish ishlaydi.
    search.offline = false;
    await typePhone(tester, '901234567');
    expect(find.text("Bu mijozga oldin ham xizmat ko'rsatilgan"), findsOneWidget);
  });

  testWidgets('kech kelgan javob yangi raqamga yozilmaydi', (tester) async {
    await pumpForm(tester);
    search.gate = Completer<void>();
    await typePhone(tester, '901234567');
    await typePhone(tester, '90123456');
    search.gate!.complete();
    await tester.pump();
    await tester.pump();
    expect(textOf(tester, name), '');
    expect(find.text("Bu mijozga oldin ham xizmat ko'rsatilgan"), findsNothing);
  });

  testWidgets('"Ko\'rish" mijozning buyurtmalarini ochadi', (tester) async {
    await pumpForm(tester);
    await typePhone(tester, '901234567');
    await tester.tap(find.text("Ko'rish"));
    await tester.pumpAndSettle();
    expect(find.byType(GlobalSearchScreen), findsOneWidget);
    final searchField = find.descendant(of: find.byType(GlobalSearchScreen), matching: find.byType(TextField));
    expect(tester.widget<TextField>(searchField).controller!.text, '90 123 45 67',
        reason: 'raqam qidiruvga tayyor yozilgan');
    expect(find.textContaining('Yakunlangan · 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test("CustomerResult: eng so'nggi manzil va GPS shu manzilniki", () {
    final c = CustomerResult(phone: '', customerName: '', orders: [
      past('x', DateTime(2026, 9, 1), location: 'Yangi manzil'),
      past('y', DateTime(2026, 8, 1), location: 'Eski manzil', gps: '41.2,69.2'),
      past('z', DateTime(2026, 7, 1), gps: 'noto\'g\'ri'),
    ]);
    expect(c.latestLocation, 'Yangi manzil');
    expect(c.latestGps, (gps: '41.2,69.2', location: 'Eski manzil'));
  });
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/auth_service.dart' show authStateProvider;

/// Chek ko'rinishi — admin panelda sozlanadi (`settings/receipt`,
/// server: lib/receiptSettings.ts). Standartlar server bilan bir xil.
class ReceiptSettings {
  final bool showLogo;
  final String title;
  final List<String> headerLines;
  final List<String> footerLines;
  final bool showCustomerName;
  final bool showCustomerPhone;
  final bool showCustomerAddress;
  final bool showItemSize;
  final bool showItemTariff;
  final bool showItemStatus;
  final bool showCashier;

  const ReceiptSettings({
    this.showLogo = true,
    this.title = 'SELTA CLEANING',
    this.headerLines = const [],
    this.footerLines = const ['Xizmatimizdan foydalanganingiz uchun rahmat!'],
    this.showCustomerName = true,
    this.showCustomerPhone = true,
    this.showCustomerAddress = false,
    this.showItemSize = true,
    this.showItemTariff = true,
    this.showItemStatus = true,
    this.showCashier = true,
  });

  factory ReceiptSettings.fromMap(Map<String, dynamic>? m) {
    const d = ReceiptSettings();
    if (m == null) return d;
    bool flag(String key, bool fallback) => m[key] is bool ? m[key] as bool : fallback;
    List<String> lines(String key, List<String> fallback) =>
        m[key] is List ? [for (final l in m[key] as List) if (l is String && l.trim().isNotEmpty) l.trim()] : fallback;
    return ReceiptSettings(
      showLogo: flag('showLogo', d.showLogo),
      title: m['title'] is String ? (m['title'] as String).trim() : d.title,
      headerLines: lines('headerLines', d.headerLines),
      footerLines: lines('footerLines', d.footerLines),
      showCustomerName: flag('showCustomerName', d.showCustomerName),
      showCustomerPhone: flag('showCustomerPhone', d.showCustomerPhone),
      showCustomerAddress: flag('showCustomerAddress', d.showCustomerAddress),
      showItemSize: flag('showItemSize', d.showItemSize),
      showItemTariff: flag('showItemTariff', d.showItemTariff),
      showItemStatus: flag('showItemStatus', d.showItemStatus),
      showCashier: flag('showCashier', d.showCashier),
    );
  }
}

/// Jonli va keshlanadigan (internetsiz ham oxirgi sozlama) — Firestore.
final receiptSettingsProvider = StreamProvider<ReceiptSettings>((ref) {
  ref.watch(authStateProvider);
  return FirebaseFirestore.instance
      .collection('settings')
      .doc('receipt')
      .snapshots()
      .map((doc) => ReceiptSettings.fromMap(doc.data()));
});

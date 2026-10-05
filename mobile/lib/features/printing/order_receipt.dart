import '../../app/theme.dart' show kTariffConfig;
import '../../core/constants.dart' show statusOf;
import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/printing/receipt.dart';
import '../../core/printing/receipt_settings.dart';
import '../../core/utils/money_utils.dart';
import '../../core/utils/phone_format.dart';
import '../shared/item_detail_row.dart' show itemMeasurementLabel;

/// "06.10.2026 14:35"
String receiptDateTime(DateTime t) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(t.day)}.${two(t.month)}.${t.year} ${two(t.hour)}:${two(t.minute)}';
}

/// Chekdagi to'lov qismi — tenglik: narx = to'langan + bonus + chegirma +
/// qarz + to'lanishi kerak (ortiqcha to'lovda oxirgisi manfiy).
class ReceiptPayment {
  final num total;
  final num paid;
  final num prepaid;
  final num bonus;
  final num discount;
  final num debt;

  const ReceiptPayment({
    required this.total,
    required this.paid,
    required this.prepaid,
    required this.bonus,
    required this.discount,
    required this.debt,
  });

  /// Buyurtmadagi yig'indilardan. Eski (yig'indilar yozilmagan) yakunlangan
  /// buyurtmada to'langan summa qolgan qismlardan tiklanadi: hisob yopilgan.
  factory ReceiptPayment.of(Order o) {
    final known = o.paidTotal;
    final paidAtHandover = known ?? (o.isDone ? (o.totalPrice - o.prepaidAmount - o.bonusAmount - o.discountTotal - o.debtTotal) : 0);
    return ReceiptPayment(
      total: o.totalPrice,
      paid: (paidAtHandover < 0 ? 0 : paidAtHandover) + o.prepaidAmount,
      prepaid: o.prepaidAmount,
      bonus: o.bonusAmount,
      discount: o.discountTotal,
      debt: o.debtTotal,
    );
  }

  /// Mijoz yana to'lashi kerak (musbat) yoki ortiqcha to'lagan (manfiy).
  num get remaining => total - paid - bonus - discount - debt;
}

/// Buyurtma cheki. Yetkazilgan buyurtmada to'liq to'lov hisobi;
/// yakunlanmaganda mahsulotlarning holati va hali to'lanishi kerak summa.
Receipt buildOrderReceipt({
  required Order order,
  required List<OrderItem> items,
  required ReceiptSettings settings,
  required DateTime now,
  String? cashier,
}) {
  final lines = <ReceiptLine>[];

  // --- Kompaniya ---
  if (settings.showLogo) lines.add(const ReceiptLogo());
  if (settings.title.isNotEmpty) lines.add(ReceiptText(settings.title, align: ReceiptAlign.center, bold: true, large: true));
  for (final l in settings.headerLines) {
    lines.add(ReceiptText(l, align: ReceiptAlign.center));
  }
  lines.add(const ReceiptDivider('='));

  // --- Buyurtma ---
  lines.add(ReceiptPair('Buyurtma ${order.displayNumber}', receiptDateTime(now), bold: true));
  if (settings.showCustomerName && order.customerName.trim().isNotEmpty) {
    lines.add(ReceiptText('Mijoz: ${order.customerName.trim()}'));
  }
  if (settings.showCustomerPhone && order.phone.isNotEmpty) {
    lines.add(ReceiptText('Tel: ${formatPhoneUz(order.phone)}'));
  }
  if (settings.showCustomerAddress && order.location.trim().isNotEmpty) {
    lines.add(ReceiptText('Manzil: ${order.location.trim()}'));
  }
  lines.add(ReceiptText(order.serviceType == 'onsite' ? 'Xizmat: Joyida yuvish' : 'Xizmat: Olib kelish'));
  if (!order.isDone) lines.add(ReceiptText('Holati: ${statusOf(order.status).label}'));
  lines.add(const ReceiptDivider());

  // --- Mahsulotlar ---
  if (items.isEmpty) {
    lines.add(const ReceiptText('Mahsulotlar hali belgilanmagan'));
  }
  for (var i = 0; i < items.length; i++) {
    final item = items[i];
    lines.add(ReceiptText('${i + 1}. ${item.subId(order.orderNumber)} ${item.name}', bold: true));
    final details = <String>[
      if (settings.showItemSize && itemMeasurementLabel(item).isNotEmpty) itemMeasurementLabel(item),
      if (settings.showItemTariff && item.tariff != null) kTariffConfig[item.tariff]?.label ?? item.tariff!,
    ];
    final status = settings.showItemStatus && !order.isDone && item.status != null ? statusOf(item.status).label : null;
    final price = item.price > 0 ? formatMoneyUz(item.price) : "o'lchanmagan";
    lines.add(ReceiptPair('   ${[...details, if (status != null) status].join(' | ')}', price));
  }
  lines.add(const ReceiptDivider());

  // --- To'lov ---
  final p = ReceiptPayment.of(order);
  lines.add(ReceiptPair('Buyurtma jami:', formatMoneyUz(p.total), bold: true));
  if (p.discount > 0) lines.add(ReceiptPair('Chegirma:', formatMoneyUz(p.discount)));
  if (p.bonus > 0) lines.add(ReceiptPair('Bonusdan:', formatMoneyUz(p.bonus)));
  if (p.debt > 0) lines.add(ReceiptPair('Qarzdorlik:', formatMoneyUz(p.debt)));
  lines.add(ReceiptPair("To'landi:", formatMoneyUz(p.paid), bold: true));
  if (p.prepaid > 0) lines.add(ReceiptPair("  shundan oldindan to'lov:", formatMoneyUz(p.prepaid)));
  final remaining = p.remaining;
  if (remaining > 0 && !order.isDone) {
    lines.add(ReceiptPair("To'lanishi kerak:", formatMoneyUz(remaining), bold: true));
  } else if (remaining < 0) {
    lines.add(ReceiptPair("Ortiqcha to'lov (qaytariladi):", formatMoneyUz(-remaining), bold: true));
  }
  lines.add(const ReceiptDivider());

  // --- Yakun ---
  if (settings.showCashier && cashier != null && cashier.trim().isNotEmpty) {
    lines.add(ReceiptText('Xodim: ${cashier.trim()}'));
  }
  for (final l in settings.footerLines) {
    lines.add(ReceiptText(l, align: ReceiptAlign.center));
  }
  return Receipt(lines);
}

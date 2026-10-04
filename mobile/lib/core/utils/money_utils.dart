/// "150000" -> "150 000 so'm" — minglik ajratkichi bilan, o'qish osonroq
/// bo'lishi uchun (talab: buyurtma narxi kartalarda ko'rinib turishi kerak).
String formatMoneyUz(num value) {
  final rounded = value.round();
  final digits = rounded.abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  final sign = rounded < 0 ? '-' : '';
  return "$sign${buffer.toString()} so'm";
}

/// Tor joy uchun qisqa ko'rinish: "2.4 mln", "850 ming", "900 so'm".
String formatMoneyShortUz(num value) {
  final v = value.abs();
  final sign = value < 0 ? '-' : '';
  String trim(double x) => x.toStringAsFixed(x >= 10 ? 0 : 1).replaceAll(RegExp(r'\.0$'), '');
  if (v >= 1000000000) return '$sign${trim(v / 1000000000)} mlrd';
  if (v >= 1000000) return '$sign${trim(v / 1000000)} mln';
  if (v >= 1000) return '$sign${(v / 1000).round()} ming';
  return "$sign${v.round()} so'm";
}

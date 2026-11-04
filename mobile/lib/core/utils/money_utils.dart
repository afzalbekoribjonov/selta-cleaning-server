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

/// O'lcham/miqdor: o'zbekcha o'nlik vergul, keraksiz nollarsiz va minglik
/// ajratkich bilan — 9.8 -> "9,8", 12.50 -> "12,5", 3.0 -> "3", 1250 -> "1 250".
String formatQtyUz(num value, {int decimals = 2}) {
  final fixed = value.abs().toStringAsFixed(decimals);
  final parts = fixed.split('.');
  final intDigits = parts[0];
  final buffer = StringBuffer();
  for (var i = 0; i < intDigits.length; i++) {
    if (i > 0 && (intDigits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(intDigits[i]);
  }
  final frac = parts.length > 1 ? parts[1].replaceFirst(RegExp(r'0+$'), '') : '';
  final sign = value < 0 ? '-' : '';
  return frac.isEmpty ? '$sign$buffer' : '$sign$buffer,$frac';
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

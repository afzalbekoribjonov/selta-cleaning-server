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

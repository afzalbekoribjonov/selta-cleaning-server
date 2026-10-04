import 'package:flutter/services.dart';

/// "XX XXX XX XX" ko'rinishida guruhlaydi (talab #3: telefon raqami
/// avtomatik formatlanishi) — 9 raqamdan ortig'ini qabul qilmaydi.
/// "+998" maydon prefiksi sifatida alohida ko'rsatiladi.
class UzPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final rawDigits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final digits = rawDigits.length > 9 ? rawDigits.substring(0, 9) : rawDigits;
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      buffer.write(digits[i]);
      if ((i == 1 || i == 4 || i == 6) && i != digits.length - 1) buffer.write(' ');
    }
    final formatted = buffer.toString();
    return TextEditingValue(text: formatted, selection: TextSelection.collapsed(offset: formatted.length));
  }
}

/// "+998901234567" -> "+998 90 123 45 67". Tanilmagan shakl o'zgarmaydi.
String formatPhoneUz(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 9) return phone;
  final d = digits.substring(digits.length - 9);
  return '+998 ${d.substring(0, 2)} ${d.substring(2, 5)} ${d.substring(5, 7)} ${d.substring(7)}';
}

import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// Ism-familiyadan bosh harflar: "Akmal Qodirov" -> "AQ", "Akmal" -> "A".
String initialsOf(String fullName) {
  // Faqat harf bilan boshlanadigan so'zlar — "..." (yuklanmoqda) kabi
  // matndan nuqta chiqib qolmasin; bunday holatda avatar belgisi chiqadi.
  final letter = RegExp(r'^\p{L}', unicode: true);
  final parts = fullName.trim().split(RegExp(r'\s+')).where(letter.hasMatch).toList();
  if (parts.isEmpty) return '';
  String first(String s) => s.characters.first.toUpperCase();
  return parts.length == 1 ? first(parts[0]) : '${first(parts[0])}${first(parts[1])}';
}

/// Brend palitrasiga mos, bir-biridan ajraladigan juftliklar — har bir
/// xodim ismiga qarab DOIM bir xil rang oladi (ro'yxatda tanib olish oson).
const _palettes = <List<Color>>[
  [Color(0xFF8C5AC3), Color(0xFF5A148C)],
  [Color(0xFF2F80D6), Color(0xFF1B5FA8)],
  [Color(0xFF0E9488), Color(0xFF0B6E66)],
  [Color(0xFFE8590C), Color(0xFFB8460A)],
  [Color(0xFFD6336C), Color(0xFFA61E4D)],
  [Color(0xFF1E9E5A), Color(0xFF157545)],
  [Color(0xFF7048E8), Color(0xFF5235B8)],
  [Color(0xFFCA8A04), Color(0xFF9A6A03)],
];

LinearGradient avatarGradientFor(String key) {
  var hash = 0;
  for (final unit in key.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  final colors = _palettes[hash % _palettes.length];
  return LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors);
}

/// Xodimning dumaloq avatari — bosh harflar va ismga bog'langan rang.
class EmployeeAvatar extends StatelessWidget {
  final String name;
  final double size;

  /// Oq halqa — rangli fon (gradient sarlavha) ustida ajralib tursin.
  final bool ring;

  const EmployeeAvatar({super.key, required this.name, this.size = 44, this.ring = false});

  @override
  Widget build(BuildContext context) {
    final initials = initialsOf(name);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: initials.isEmpty ? heroGradient : avatarGradientFor(name.trim().toLowerCase()),
        border: ring ? Border.all(color: Colors.white, width: 2) : null,
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.14), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: initials.isEmpty
          ? Icon(Icons.person_rounded, color: Colors.white, size: size * 0.55)
          : Text(
              initials,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: size * 0.36,
                letterSpacing: 0.3,
                height: 1,
              ),
            ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Selta Cleaning brend palitrasi — "Selta Cleaning Guidebook E.pdf"
/// (2023 GUIDELINE) dan olingan rasmiy ranglar:
///   Pantone 267 C  -> #5A148C (asosiy binafsha)
///   Pantone 814 C  -> #8C5AC3 (ikkinchi darajali binafsha)
///   Urg'u rangi    -> #FAC800 (sariq)
///   Gray/Ink/White qo'llanmadagi CMYK/RGB qiymatlari bilan bir xil.
class AppColors {
  AppColors._();

  static const primary = Color(0xFF5A148C);
  static const primaryDark = Color(0xFF430F68);
  static const secondary = Color(0xFF8C5AC3);
  static const accent = Color(0xFFFAC800);

  static const ink = Color(0xFF141414);
  static const gray = Color(0xFFAAA5AF);
  static const grayDark = Color(0xFF7A7482);
  static const border = Color(0xFFE7E2ED);
  static const surface = Color(0xFFFFFFFF);
  static const bg = Color(0xFFF6F3FA);
  static const white = Color(0xFFFFFFFF);

  // Semantik holat ranglari — brend palitrasidan ataylab ajratilgan
  // (masalan urg'u rangi #FAC800 "ogohlantirish" bilan aralashib
  // ketmasligi uchun "warning" boshqa ottenkada).
  static const success = Color(0xFF1E9E5A);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFDC2626);
  static const info = Color(0xFF2F80D6);
}

const primaryGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppColors.primary, AppColors.primaryDark],
);

const heroGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppColors.secondary, AppColors.primary],
);

/// Tarif rangi — har biri o'z ma'nosiga ega (talab: "har bir tarif o'zini
/// ma'no jihatdan ranglariga ega bo'ladi"):
///  - Express (4 kun)   -> to'q sariq: tezlik/shoshilinchlik
///  - Comfort (7 kun)   -> teal: osoyishta/muvozanatli
///  - Standart (12 kun) -> neytral kulrang: bazaviy/tejamkor
///  - Premium (4 kun)   -> brend urg'u rangi (oltin sariq): eksklyuziv/yuqori
///    sifat xizmat — bir xil tezlikdagi Express'dan xizmat darajasi bilan
///    ajralib turishini ranggi orqali ham ko'rsatadi.
class TariffInfo {
  final String label;
  final String daysLabel;
  final Color color;
  final Color background;

  const TariffInfo({
    required this.label,
    required this.daysLabel,
    required this.color,
    required this.background,
  });
}

const Map<String, int> kTariffDays = {
  'express': 4,
  'comfort': 7,
  'standart': 12,
  'premium': 4,
};

const Map<String, TariffInfo> kTariffConfig = {
  'express': TariffInfo(
    label: 'Express',
    daysLabel: '4 kunlik',
    color: Color(0xFFE8590C),
    background: Color(0xFFFFF0E6),
  ),
  'comfort': TariffInfo(
    label: 'Comfort',
    daysLabel: '7 kunlik',
    color: Color(0xFF0E9488),
    background: Color(0xFFE3F8F6),
  ),
  'standart': TariffInfo(
    label: 'Standart',
    daysLabel: '12 kunlik',
    color: AppColors.grayDark,
    background: Color(0xFFF1EFF3),
  ),
  'premium': TariffInfo(
    label: 'Premium',
    daysLabel: '4 kunlik',
    color: Color(0xFFA07A00),
    background: Color(0xFFFEF6DC),
  ),
};

TariffInfo tariffOf(String? tariff) =>
    kTariffConfig[tariff] ?? kTariffConfig['standart']!;

class AppTheme {
  AppTheme._();

  static ThemeData light() {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.secondary,
      onSecondary: Colors.white,
      error: AppColors.danger,
      onError: Colors.white,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
    );

    // Celebes Font Family (brend qo'llanmasidagi rasmiy shrift) litsenziya
    // fayllari hali taqdim etilmagan — vaqtincha Plus Jakarta Sans (sarlavha
    // uchun, geometrik va qalin) + Inter (matn uchun) ishlatiladi.
    final headingFont = GoogleFonts.plusJakartaSansTextTheme();
    final bodyFont = GoogleFonts.interTextTheme();

    final textTheme = bodyFont.copyWith(
      displayLarge: headingFont.displayLarge,
      displayMedium: headingFont.displayMedium,
      displaySmall: headingFont.displaySmall,
      headlineLarge: headingFont.headlineLarge?.copyWith(fontWeight: FontWeight.w800),
      headlineMedium: headingFont.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
      headlineSmall: headingFont.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
      titleLarge: headingFont.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: headingFont.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      titleSmall: headingFont.titleSmall?.copyWith(fontWeight: FontWeight.w600),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.bg,
      textTheme: textTheme.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.ink,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: headingFont.titleLarge?.copyWith(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: AppColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      splashFactory: InkRipple.splashFactory,
    );
  }
}

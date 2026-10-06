import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/services.dart' show rootBundle;
import 'package:image/image.dart' as img;

import 'receipt.dart';

/// Chek logosi — oldindan tayyorlangan qora-oq rasm (384 nuqta, oq fon):
/// tool/make_receipt_logo.dart. Oldindan ko'rish ham AYNAN shu faylni
/// ko'rsatadi.
const kReceiptLogoAsset = 'assets/receipt/logo.png';

CapabilityProfile? _profile;

/// Printer imkoniyatlari ro'yxati — kutubxona ichidagi fayl, bir marta o'qiladi.
Future<CapabilityProfile> _loadProfile() async => _profile ??= await CapabilityProfile.load();

/// Joylashtirilgan chek qatorlarini termal printer buyruqlariga (ESC/POS)
/// aylantiradi. Qatorlar allaqachon kerakli enda va tekislangan
/// (receipt.dart: layoutReceipt) — bu yerda faqat uslub va rasm.
///
/// Arzon printerlar uchun (gilam_yuvish_furqat'da sinalgan):
///  - logo ESC * (ustunli rasm) bilan — deyarli hamma printer tushunadi;
///    GS v 0 (raster) ko'p arzon printerlarda g'alati belgi chiqarardi;
///  - qog'ozni kesish buyrug'i YO'Q — pichog'i yo'q printerlar uni
///    belgilar sifatida chop etib yuboradi; o'rniga bo'sh qatorlar;
///  - oxirida uslub oddiy holatga qaytariladi — keyingi chek katta harf
///    bilan boshlanib qolmasin.
Future<List<int>> encodeReceipt(
  List<PrintedLine> lines,
  PaperWidth paper, {
  img.Image? logo,
  int feedLines = 3,
}) async {
  final generator = Generator(paper == PaperWidth.mm80 ? PaperSize.mm80 : PaperSize.mm58, await _loadProfile());
  final bytes = <int>[...generator.reset()];
  for (final line in lines) {
    if (line.isLogo) {
      if (logo != null) {
        bytes
          ..addAll(generator.image(logo, align: PosAlign.center))
          ..addAll(generator.feed(1));
      }
      continue;
    }
    bytes.addAll(generator.text(
      // Bo'sh qator ham chiqsin (ba'zi printerlar bo'sh buyruqni tashlab yuboradi).
      line.text.isEmpty ? ' ' : line.text,
      styles: PosStyles(
        bold: line.bold,
        width: line.large ? PosTextSize.size2 : PosTextSize.size1,
        height: line.large || line.tall ? PosTextSize.size2 : PosTextSize.size1,
      ),
    ));
  }
  bytes
    ..addAll(generator.setStyles(const PosStyles()))
    ..addAll(generator.feed(feedLines));
  return bytes;
}

img.Image? _logo;
bool _logoLoaded = false;

/// Chek logosi (bir marta o'qiladi). Topilmasa — chek logosiz chiqadi.
Future<img.Image?> loadReceiptLogo() async {
  if (_logoLoaded) return _logo;
  try {
    final data = await rootBundle.load(kReceiptLogoAsset);
    final src = img.decodePng(data.buffer.asUint8List());
    // Fayl allaqachon qora-oq; baribir himoya: shaffoflik qolmasin
    // (ESC * shaffof joyni QORA deb chop etadi).
    _logo = src == null ? null : monochromeLogo(src, src.width);
  } catch (e) {
    debugPrint("Chek logosini o'qib bo'lmadi: $e");
    _logo = null;
  }
  _logoLoaded = true;
  return _logo;
}

/// [src]ni [width] enga keltirib, OQ fonda aniq qora/oq rasmga aylantiradi
/// (alfa kanalsiz).
img.Image monochromeLogo(img.Image src, int width) {
  final resized = src.width == width ? src : img.copyResize(src, width: width, interpolation: img.Interpolation.average);
  final out = img.Image(width: resized.width, height: resized.height);
  for (final p in resized) {
    final alpha = p.a / p.maxChannelValue;
    final lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
    final onWhite = lum * alpha + p.maxChannelValue * (1 - alpha);
    final v = onWhite < p.maxChannelValue * 0.62 ? 0 : 255;
    out.setPixelRgb(p.x, p.y, v, v, v);
  }
  return out;
}

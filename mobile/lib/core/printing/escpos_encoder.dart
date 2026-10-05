import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:image/image.dart' as img;

import 'receipt.dart';

/// Joylashtirilgan chek qatorlarini termal printer buyruqlariga (ESC/POS)
/// aylantiradi. Qatorlar allaqachon kerakli enda va tekislangan
/// (receipt.dart: layoutReceipt) — bu yerda faqat uslub va rasm.
Future<List<int>> encodeReceipt(List<PrintedLine> lines, PaperWidth paper, {img.Image? logo}) async {
  final profile = await CapabilityProfile.load();
  final generator = Generator(paper == PaperWidth.mm80 ? PaperSize.mm80 : PaperSize.mm58, profile);
  final bytes = <int>[...generator.reset()];
  for (final line in lines) {
    if (line.isLogo) {
      if (logo != null) bytes.addAll(generator.imageRaster(logo, align: PosAlign.center));
      continue;
    }
    final size = line.large ? PosTextSize.size2 : PosTextSize.size1;
    bytes.addAll(generator.text(line.text, styles: PosStyles(bold: line.bold, width: size, height: size)));
  }
  bytes
    ..addAll(generator.feed(3))
    ..addAll(generator.cut());
  return bytes;
}

final _logoCache = <PaperWidth, img.Image>{};

/// Selta logotipi termal printer uchun: qog'oz enining ~75% i, eni 8 ga
/// karrali (printer qatori baytlarga bo'linadi), shaffof fon OQ, rang esa
/// aniq qora/oq — aks holda binafsha logotip kulrang dog' bo'lib chiqadi.
Future<img.Image?> loadReceiptLogo(PaperWidth paper) async {
  final cached = _logoCache[paper];
  if (cached != null) return cached;
  final data = await rootBundle.load('assets/brand/lockup_purple.png');
  final src = img.decodePng(data.buffer.asUint8List());
  if (src == null) return null;
  final logo = monochromeLogo(src, (paper.dots * 0.75).round() ~/ 8 * 8);
  _logoCache[paper] = logo;
  return logo;
}

/// [src]ni [width] enga kichraytirib, oq fonda qora/oq rasmga aylantiradi.
img.Image monochromeLogo(img.Image src, int width) {
  final resized = img.copyResize(src, width: width, interpolation: img.Interpolation.average);
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

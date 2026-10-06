// Chek printeri uchun logoni tayyorlaydi (bir martalik, natija
// assets/receipt/ ga yoziladi va ilova bilan birga tarqatiladi).
//
// Termoprinter faqat qora yoki oq nuqta chiqaradi — kulrang oraliq yo'q.
// Rangli (binafsha), shaffof fonli logo esa ilova ichida har safar
// aylantirilganda xira chiqardi, chop etish buyrug'i (ESC *) esa shaffof
// joyni QORA deb biladi. Shu sabab logo oldindan:
//   1) oq fonga qo'yiladi (shaffoflik yo'qoladi),
//   2) atrofdagi oq hoshiya kesiladi,
//   3) chek eniga (384 nuqta — 58 mm qog'ozning to'liq eni) keltiriladi,
//   4) aniq qora/oq qilinadi.
//
// Ishga tushirish (mobile/ papkasida):
//   dart run tool/make_receipt_logo.dart assets/brand/lockup_purple.png assets/receipt/logo.png

import 'dart:io';

import 'package:image/image.dart';

/// 58 mm qog'ozdagi nuqtalar soni.
const _targetWidth = 384;

/// Shu darajadan qorong'i nuqta — qora, qolgani oq.
const _threshold = 165;

void main(List<String> args) {
  if (args.length < 2) {
    stderr.writeln('Foydalanish: dart run tool/make_receipt_logo.dart <manba.png> <natija.png>');
    exit(64);
  }
  final source = decodeImage(File(args[0]).readAsBytesSync());
  if (source == null) {
    stderr.writeln("Rasmni o'qib bo'lmadi: ${args[0]}");
    exit(65);
  }

  final onWhite = _flattenOnWhite(source);
  final trimmed = _trimWhiteBorder(onWhite);
  final scaled = copyResize(trimmed, width: _targetWidth, interpolation: Interpolation.average);

  final out = Image(width: scaled.width, height: scaled.height);
  for (final p in scaled) {
    final black = p.luminance < _threshold;
    out.setPixelRgb(p.x, p.y, black ? 0 : 255, black ? 0 : 255, black ? 0 : 255);
  }

  File(args[1])
    ..createSync(recursive: true)
    ..writeAsBytesSync(encodePng(out));
  stdout.writeln('Tayyor: ${args[1]} (${out.width}x${out.height})');
}

/// Shaffof fonni oq qiladi (natija — alfasiz RGB).
Image _flattenOnWhite(Image src) {
  final out = Image(width: src.width, height: src.height);
  for (final p in src) {
    final a = p.aNormalized;
    int mix(num c) => (c * a + 255 * (1 - a)).round().clamp(0, 255);
    out.setPixelRgb(p.x, p.y, mix(p.r / p.maxChannelValue * 255), mix(p.g / p.maxChannelValue * 255), mix(p.b / p.maxChannelValue * 255));
  }
  return out;
}

/// Atrofdagi oq hoshiyani kesadi — chekda ortiqcha bo'sh joy qolmasin.
Image _trimWhiteBorder(Image src) {
  bool white(int x, int y) => src.getPixel(x, y).luminance >= 240;
  bool rowWhite(int y) => List.generate(src.width, (x) => x).every((x) => white(x, y));
  bool colWhite(int x) => List.generate(src.height, (y) => y).every((y) => white(x, y));

  var top = 0, bottom = src.height - 1, left = 0, right = src.width - 1;
  while (top < bottom && rowWhite(top)) {
    top++;
  }
  while (bottom > top && rowWhite(bottom)) {
    bottom--;
  }
  while (left < right && colWhite(left)) {
    left++;
  }
  while (right > left && colWhite(right)) {
    right--;
  }
  return copyCrop(src, x: left, y: top, width: right - left + 1, height: bottom - top + 1);
}

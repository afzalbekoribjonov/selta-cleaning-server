/// Chek — printerga bog'liq bo'lmagan TAVSIF: nima va qanday tartibda
/// chiqadi. Undan [layoutReceipt] belgilangan kenglikdagi (58 mm — 32,
/// 80 mm — 48 belgi) aniq qatorlarni quradi; ekrandagi oldindan ko'rish
/// ham, printerga ketadigan baytlar ham AYNAN shu qatorlardan olinadi —
/// xodim ekranda ko'rgani qog'ozda xuddi shunday chiqadi.
library;

enum ReceiptAlign { left, center, right }

sealed class ReceiptLine {
  const ReceiptLine();
}

/// Kompaniya logotipi (rasm) — sozlamada o'chirilishi mumkin.
class ReceiptLogo extends ReceiptLine {
  const ReceiptLogo();
}

class ReceiptText extends ReceiptLine {
  final String text;
  final ReceiptAlign align;
  final bool bold;

  /// Ikki barobar katta (eni ham, bo'yi ham) — sarlavha uchun.
  final bool large;

  const ReceiptText(this.text, {this.align = ReceiptAlign.left, this.bold = false, this.large = false});
}

/// Chapda nom, o'ngda qiymat ("Buyurtma jami ......... 440 000 so'm").
class ReceiptPair extends ReceiptLine {
  final String left;
  final String right;
  final bool bold;

  const ReceiptPair(this.left, this.right, {this.bold = false});
}

class ReceiptDivider extends ReceiptLine {
  final String char;
  const ReceiptDivider([this.char = '-']);
}

class ReceiptGap extends ReceiptLine {
  final int lines;
  const ReceiptGap([this.lines = 1]);
}

class Receipt {
  final List<ReceiptLine> lines;
  const Receipt(this.lines);

  /// Server (yoki admin panel) tayyorlagan bloklardan — masalan kunlik
  /// hisobot cheki (server: lib/dailyReceipt.ts). Noma'lum blok tashlab
  /// ketiladi; haddan ziyod uzun ro'yxat kesiladi (himoya).
  factory Receipt.fromBlocks(List<dynamic> blocks) {
    String str(Object? v) => v is String ? (v.length > 200 ? v.substring(0, 200) : v) : '';
    final lines = <ReceiptLine>[];
    for (final raw in blocks.take(600)) {
      if (raw is! Map) continue;
      final bold = raw['bold'] == true;
      switch (raw['kind']) {
        case 'logo':
          lines.add(const ReceiptLogo());
        case 'text':
          lines.add(ReceiptText(
            str(raw['text']),
            align: raw['align'] == 'center' ? ReceiptAlign.center : ReceiptAlign.left,
            bold: bold,
            large: raw['large'] == true,
          ));
        case 'pair':
          lines.add(ReceiptPair(str(raw['left']), str(raw['right']), bold: bold));
        case 'divider':
          final ch = str(raw['char']);
          lines.add(ReceiptDivider(ch.isEmpty ? '-' : ch.substring(0, 1)));
      }
    }
    return Receipt(lines);
  }
}

/// Qog'oz eni.
enum PaperWidth {
  mm58(32, 384),
  mm80(48, 576);

  /// Oddiy shriftdagi belgilar soni.
  final int chars;

  /// Nuqtalar (logotip eni shunga moslanadi).
  final int dots;

  const PaperWidth(this.chars, this.dots);

  static PaperWidth fromMm(int? mm) => mm == 80 ? PaperWidth.mm80 : PaperWidth.mm58;
  int get mm => this == PaperWidth.mm80 ? 80 : 58;
}

/// Joylashtirilgan bitta qator.
class PrintedLine {
  final String text;
  final bool bold;
  final bool large;
  final bool isLogo;

  const PrintedLine(this.text, {this.bold = false, this.large = false}) : isLogo = false;
  const PrintedLine.logo()
      : text = '',
        bold = false,
        large = false,
        isLogo = true;

  @override
  String toString() => isLogo ? '[LOGO]' : text;
}

const _replacements = {
  'ʻ': "'", 'ʼ': "'", '‘': "'", '’': "'", '`': "'", '´': "'",
  '“': '"', '”': '"', '«': '"', '»': '"',
  '—': '-', '–': '-', '−': '-', '·': '|', '•': '*', '…': '...',
  '×': 'x', '²': '2', '³': '3', '№': 'N',
  '\u00A0': ' ', '\u202F': ' ', // bo'linmaydigan bo'shliqlar
};

/// Termal printer ishonchli chiqaradigan oddiy belgilarga o'tkazadi:
/// arzon printerlarda "ʻ", "²", "×" kabi belgilar "?" bo'lib chiqadi.
String receiptAscii(String input) {
  final out = StringBuffer();
  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    final replaced = _replacements[ch];
    if (replaced != null) {
      out.write(replaced);
    } else if (rune == 10 || (rune >= 32 && rune < 127)) {
      out.write(ch);
    } else {
      out.write('?');
    }
  }
  return out.toString();
}

/// Matnni [width] belgidan oshmaydigan qatorlarga so'z bo'yicha bo'ladi;
/// juda uzun so'z bo'laklarga kesiladi.
List<String> wrapText(String text, int width) {
  final result = <String>[];
  for (final paragraph in text.split('\n')) {
    var line = '';
    for (var word in paragraph.split(RegExp(r'\s+')).where((w) => w.isNotEmpty)) {
      while (word.length > width) {
        if (line.isNotEmpty) {
          result.add(line);
          line = '';
        }
        result.add(word.substring(0, width));
        word = word.substring(width);
      }
      if (line.isEmpty) {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line = '$line $word';
      } else {
        result.add(line);
        line = word;
      }
    }
    result.add(line);
  }
  return result;
}

String _align(String text, int width, ReceiptAlign align) {
  final pad = width - text.length;
  if (pad <= 0) return text;
  return switch (align) {
    ReceiptAlign.left => text,
    ReceiptAlign.right => '${' ' * pad}$text',
    ReceiptAlign.center => '${' ' * (pad ~/ 2)}$text',
  };
}

/// Chekni [paper] eniga joylaydi. Har bir qator [PaperWidth.chars] dan
/// (katta matnda yarmidan) oshmaydi.
List<PrintedLine> layoutReceipt(Receipt receipt, PaperWidth paper) {
  final width = paper.chars;
  final out = <PrintedLine>[];
  for (final line in receipt.lines) {
    switch (line) {
      case ReceiptLogo():
        out.add(const PrintedLine.logo());
      case ReceiptText(:final text, :final align, :final bold, :final large):
        final w = large ? width ~/ 2 : width;
        for (final part in wrapText(receiptAscii(text), w)) {
          out.add(PrintedLine(_align(part, w, align), bold: bold, large: large));
        }
      case ReceiptPair(:final left, :final right, :final bold):
        final l = receiptAscii(left).trim();
        final r = receiptAscii(right).trim();
        if (l.length + 1 + r.length <= width) {
          out.add(PrintedLine('$l${' ' * (width - l.length - r.length)}$r', bold: bold));
        } else {
          // Nom uzun: u o'z qatorlariga bo'linadi, qiymat oxirgi qatorga
          // sig'sa o'sha yerda, aks holda alohida qatorda o'ng tomonda.
          final parts = wrapText(l, width);
          final last = parts.removeLast();
          for (final p in parts) {
            out.add(PrintedLine(p, bold: bold));
          }
          if (last.length + 1 + r.length <= width) {
            out.add(PrintedLine('$last${' ' * (width - last.length - r.length)}$r', bold: bold));
          } else {
            out.add(PrintedLine(last, bold: bold));
            out.add(PrintedLine(_align(r.length > width ? r.substring(0, width) : r, width, ReceiptAlign.right), bold: bold));
          }
        }
      case ReceiptDivider(:final char):
        out.add(PrintedLine(char * width));
      case ReceiptGap(:final lines):
        for (var i = 0; i < lines; i++) {
          out.add(const PrintedLine(''));
        }
    }
  }
  return out;
}

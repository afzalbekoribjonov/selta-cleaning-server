/**
 * Telegram xabarlari uchun matn yordamchilari — HTML xavfsizligi, son va
 * pul formati, sana, lotin -> kirill o'girish va uzun xabarni bo'lish.
 *
 * Bu yerda Firestore ham, tarmoq ham yo'q: hammasi toza funksiyalar,
 * shuning uchun alohida sinovdan o'tkaziladi (test/telegramText.test.js).
 */

export type Script = "latn" | "cyrl";

/** Telegram HTML rejimi uchun: `<`, `>` va `&` o'zgartiriladi. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Sonni minglik guruhlarga ajratadi; bo'shliq — uzilmaydigan (NBSP). */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "1 250 000 so'm" (manfiy — "−50 000 so'm"). Kasr qism yaxlitlanadi. */
export function money(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const sign = n < 0 ? "−" : "";
  return `${sign}${groupThousands(String(Math.abs(n)))} so'm`;
}

/** Faqat raqam: "1 250 000". */
export function int(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return (n < 0 ? "−" : "") + groupThousands(String(Math.abs(n)));
}

/** Hajm: 2 xonagacha, ortiqcha nollarsiz, vergul bilan — "186,5", "12", "0". */
export function qty(value: number): string {
  const n = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  const fraction = frac.replace(/0+$/, "");
  return (n < 0 ? "−" : "") + groupThousands(whole) + (fraction ? `,${fraction}` : "");
}

// ------------------------------------------------------------------ SANA

const BUSINESS_OFFSET_MS = 5 * 60 * 60_000;

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

function local(date: Date): Date {
  return new Date(date.getTime() + BUSINESS_OFFSET_MS);
}

/** "6-noyabr" (biznes vaqti, UTC+5). */
export function dayMonth(date: Date): string {
  const l = local(date);
  return `${l.getUTCDate()}-${MONTHS[l.getUTCMonth()]}`;
}

/** "14:05" (biznes vaqti). */
export function hhmm(date: Date): string {
  const l = local(date);
  return `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

/** "6-noyabr, 14:05". */
export function dateTime(date: Date): string {
  return `${dayMonth(date)}, ${hhmm(date)}`;
}

/** "2026-11-06" -> "6-noyabr, 2026 · Payshanba". */
export function longDateOfKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d}-${MONTHS[m - 1]}, ${y} · ${weekday}`;
}

// ------------------------------------------------------- LOTIN -> KIRILL

/**
 * So'z bo'yicha istisnolar: chet so'zlar va o'zlashmalar, ularni harfma-
 * harf o'girish noto'g'ri chiqadi ("Express" -> "Эхпресс").
 */
const WORD_OVERRIDES: Record<string, string> = {
  express: "экспресс",
  comfort: "комфорт",
  standart: "стандарт",
  premium: "премиум",
  selta: "селта",
  cleaning: "клининг",
  sentabr: "сентябр",
  oktabr: "октябр",
  kg: "кг",
  id: "ID",
};

const APOSTROPHES = "'’ʻʼ`‘";
const isApostrophe = (ch: string | undefined) => ch !== undefined && APOSTROPHES.includes(ch);
const isLetter = (ch: string | undefined) => ch !== undefined && /[A-Za-z]/.test(ch);

const SINGLE: Record<string, string> = {
  a: "а", b: "б", c: "с", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
};

function withCase(cyr: string, sourceFirst: string): string {
  return sourceFirst === sourceFirst.toUpperCase() && sourceFirst !== sourceFirst.toLowerCase()
    ? cyr.charAt(0).toUpperCase() + cyr.slice(1)
    : cyr;
}

/** Bitta so'zni (faqat harf va apostroflar) o'giradi. */
function wordToCyrillic(word: string): string {
  const override = WORD_OVERRIDES[word.toLowerCase()];
  if (override) {
    if (override === "ID") return word;
    const allUpper = word.length > 1 && word === word.toUpperCase();
    return allUpper ? override.toUpperCase() : withCase(override, word[0]);
  }

  const allUpper = word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
  let out = "";
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    const lower = ch.toLowerCase();
    const next = word[i + 1];
    const nextLower = next?.toLowerCase();
    const atWordStart = i === 0;

    if (!isLetter(ch)) {
      // Apostrof: o' / g' dan keyingisi allaqachon iste'mol qilingan;
      // qolgani — tutuq belgisi ("ma'lumot" -> "маълумот").
      out += isApostrophe(ch) && i > 0 && isLetter(word[i - 1]) ? "ъ" : ch;
      i += 1;
      continue;
    }

    let cyr: string;
    let consumed = 1;
    if ((lower === "o" || lower === "g") && isApostrophe(next)) {
      cyr = lower === "o" ? "ў" : "ғ";
      consumed = 2;
    } else if (lower === "s" && nextLower === "h") {
      cyr = "ш";
      consumed = 2;
    } else if (lower === "c" && nextLower === "h") {
      cyr = "ч";
      consumed = 2;
    } else if (lower === "y" && nextLower === "o" && !isApostrophe(word[i + 2])) {
      cyr = "ё";
      consumed = 2;
    } else if (lower === "y" && nextLower === "u") {
      cyr = "ю";
      consumed = 2;
    } else if (lower === "y" && nextLower === "a") {
      cyr = "я";
      consumed = 2;
    } else if (lower === "y" && nextLower === "e") {
      cyr = "е";
      consumed = 2;
    } else if (lower === "e" && atWordStart) {
      cyr = "э";
    } else {
      cyr = SINGLE[lower] ?? ch;
    }

    out += allUpper ? cyr.toUpperCase() : withCase(cyr, ch);
    i += consumed;
  }
  return out;
}

/**
 * Lotin yozuvidagi matnni kirillga o'giradi. HTML teglari, `&amp;` kabi
 * belgilar, buyruqlar (`/hisobot`) va raqamlar o'zgarmaydi.
 */
export function toCyrillic(text: string): string {
  return text
    .split(/(<[^>]*>|&[a-zA-Z#0-9]+;|\/[a-z_]+)/g)
    .map((part, idx) => {
      if (idx % 2 === 1) return part; // tegi, belgisi yoki buyruq
      return part.replace(/[A-Za-z]+(?:['’ʻʼ`‘][A-Za-z]+)*['’ʻʼ`‘]?/g, (w) => wordToCyrillic(w)).replace(/m²/g, "м²");
    })
    .join("");
}

/** Tanlangan yozuvga moslaydi (lotin — o'zgarishsiz). */
export function inScript(text: string, script: Script): string {
  return script === "cyrl" ? toCyrillic(text) : text;
}

// -------------------------------------------------------- XABARNI BO'LISH

/** Telegram cheklovi 4096 belgi; zaxira bilan. */
export const MESSAGE_LIMIT = 3900;

/**
 * Bloklarni (har biri o'zi to'liq, teglari yopilgan) bo'sh qator bilan
 * birlashtiradi va chegaradan oshsa bir nechta xabarga bo'ladi. Blok
 * o'rtasidan emas — teglar hech qachon uzilib qolmaydi. Bitta blok
 * chegaradan katta bo'lsa, u qatorlari bo'yicha bo'linadi.
 */
export function packBlocks(blocks: string[], limit = MESSAGE_LIMIT): string[] {
  const pieces: string[] = [];
  for (const block of blocks.filter((b) => b.trim() !== "")) {
    if (block.length <= limit) {
      pieces.push(block);
      continue;
    }
    let chunk = "";
    for (const line of block.split("\n")) {
      const safeLine = line.length > limit ? line.slice(0, limit - 1) + "…" : line;
      if (chunk && chunk.length + 1 + safeLine.length > limit) {
        pieces.push(chunk);
        chunk = safeLine;
      } else {
        chunk = chunk ? `${chunk}\n${safeLine}` : safeLine;
      }
    }
    if (chunk) pieces.push(chunk);
  }

  const messages: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 2 + piece.length > limit) {
      messages.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) messages.push(current);
  return messages;
}

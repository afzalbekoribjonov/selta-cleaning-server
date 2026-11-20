import { esc } from "../telegram/text";
import type { AppStatus, MediaKind } from "./store";

export { esc };

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const TZ_MS = 5 * 3600_000;

/** "20-noyabr, 14:32" (Toshkent vaqti). */
export function dateTime(d: Date): string {
  const t = new Date(d.getTime() + TZ_MS);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${t.getUTCDate()}-${MONTHS[t.getUTCMonth()]}, ${hh}:${mm}`;
}

/** "20.11.2026". */
export function shortDate(d: Date): string {
  const t = new Date(d.getTime() + TZ_MS);
  return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.${t.getUTCFullYear()}`;
}

/**
 * Ism-familiya: kamida ikki so'z, harflar (lotin/kirill), apostrof va
 * defis. Ortiqcha bo'shliqlar olib tashlanadi, har bir so'z bosh harf bilan.
 */
export function cleanFullName(raw: string): string | null {
  const v = raw.replace(/[‘’ʻʼ`]/g, "'").replace(/\s+/g, " ").trim();
  if (v.length < 5 || v.length > 70) return null;
  const words = v.split(" ");
  if (words.length < 2 || words.length > 5) return null;
  if (!words.every((w) => /^[\p{L}][\p{L}'-]*$/u.test(w))) return null;
  return words.map((w) => w.charAt(0).toLocaleUpperCase("uz") + w.slice(1)).join(" ");
}

export const MIN_AGE = 16;
export const MAX_AGE = 70;

export function parseAge(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})(\s*(yosh|ёш|лет|years?))?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= MIN_AGE && n <= MAX_AGE ? n : null;
}

/**
 * Telefon: "+998 90 123 45 67", "90 123 45 67", "998901234567" — hammasi
 * "+998901234567" ko'rinishiga keltiriladi. Boshqa davlat raqami (10–15
 * raqam, "+" bilan) ham qabul qilinadi.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const plain = digits.replace(/\+/g, "");
  if (/^\d{9}$/.test(plain) && !digits.startsWith("+")) return `+998${plain}`;
  if (/^998\d{9}$/.test(plain)) return `+${plain}`;
  if (digits.startsWith("+") && /^\d{10,15}$/.test(plain)) return `+${plain}`;
  return null;
}

/** "+998901234567" -> "+998 90 123 45 67". */
export function prettyPhone(phone: string): string {
  const m = phone.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export const STATUS_ADMIN: Record<AppStatus, string> = {
  new: "🆕 Yangi",
  reviewing: "🕓 Ko'rib chiqilmoqda",
  accepted: "✅ Qabul qilingan",
  rejected: "❌ Rad etilgan",
};

export const STATUS_ICON: Record<AppStatus, string> = { new: "🆕", reviewing: "🕓", accepted: "✅", rejected: "❌" };

/** Nomzodga ko'rinadigan holat — yumshoqroq ifoda. */
export const STATUS_CANDIDATE: Record<AppStatus, string> = {
  new: "🕓 Ko'rib chiqilmoqda",
  reviewing: "🕓 Ko'rib chiqilmoqda",
  accepted: "✅ Qabul qilindi",
  rejected: "📌 Ko'rib chiqildi",
};

export const MEDIA_LABEL: Record<MediaKind, string> = {
  video: "🎥 video",
  video_note: "🎥 video",
  photo: "🖼 rasm",
  voice: "🎙 ovozli xabar",
  audio: "🎙 audio",
  document: "📎 fayl",
  text: "matn",
};

/** Matnni Telegram chegarasiga sig'diradi. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** "1:05" ko'rinishida davomiylik. */
export function duration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

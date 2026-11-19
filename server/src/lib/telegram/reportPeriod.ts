import type { InlineKeyboard } from "./api";
import { MAX_REPORT_DAYS } from "./dayReport";
import { inScript, monthName, periodLong, type Script } from "./text";

/**
 * Hisobot davrini tanlash — tayyor davrlar (bugun, kecha, hafta, oy) va
 * inline kalendar (istalgan kun yoki oraliq, butun oy). Toza funksiyalar:
 * faqat sana kalitlari ("YYYY-MM-DD") bilan ishlaydi, Telegram'siz sinaladi.
 *
 * Tugma ma'lumotlari (64 baytdan qisqa):
 *   hp:<preset>        — tayyor davr (today, yday, week, lweek, month, lmonth)
 *   hc:<YYYY-MM>[:<from>] — kalendar oyi (boshlanish kuni tanlangan bo'lishi mumkin)
 *   hd:<from>[:<to>]   — kun bosildi (birinchisi — boshlanish, ikkinchisi — tugash)
 *   hm:<YYYY-MM>       — butun oy
 *   hr:<from>:<to>     — shu davrni (qayta) yuborish
 *   hb                 — davr menyusiga qaytish
 *   hl                 — yozuvni almashtirish (lotin ⇄ kirill)
 *   hn                 — bo'sh katak (hech narsa qilmaydi)
 */

export type Range = { from: string; to: string };

const DAY_MS = 86_400_000;
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (key: string) => Date.parse(`${key}T00:00:00Z`);

export function addDays(key: string, days: number): string {
  return toKey(msOf(key) + days * DAY_MS);
}

/** Dushanba = 0 ... Yakshanba = 6 (O'zbekistonda hafta dushanbadan). */
function weekdayMon(key: string): number {
  return (new Date(msOf(key)).getUTCDay() + 6) % 7;
}

export function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return toKey(Date.UTC(y, m, 0));
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function daysIn(range: Range): number {
  return Math.round((msOf(range.to) - msOf(range.from)) / DAY_MS) + 1;
}

export const PRESETS = ["today", "yday", "week", "lweek", "month", "lmonth"] as const;
export type Preset = (typeof PRESETS)[number];

const PRESET_LABELS: Record<Preset, string> = {
  today: "Bugun",
  yday: "Kecha",
  week: "Shu hafta",
  lweek: "O'tgan hafta",
  month: "Shu oy",
  lmonth: "O'tgan oy",
};

export function presetRange(preset: Preset, today: string): Range {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "week":
      return { from: addDays(today, -weekdayMon(today)), to: today };
    case "lweek": {
      const monday = addDays(today, -weekdayMon(today) - 7);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "lmonth": {
      const ym = shiftMonth(today.slice(0, 7), -1);
      return { from: `${ym}-01`, to: lastDayOfMonth(ym) };
    }
  }
}

/** Butun oy: o'tgan oyda — oxirgi kunigacha, joriy oyda — bugungacha. */
export function monthRange(yearMonth: string, today: string): Range | null {
  const from = `${yearMonth}-01`;
  if (from > today) return null;
  const last = lastDayOfMonth(yearMonth);
  return { from, to: last < today ? last : today };
}

/** Oraliqni tekshiradi: tartibi to'g'rilanadi, kelajak va juda uzun oraliq rad etiladi. */
export function normalizeRange(a: string, b: string, today: string): Range | "future" | "too-long" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || Number.isNaN(msOf(a)) || Number.isNaN(msOf(b))) return null;
  if (toKey(msOf(a)) !== a || toKey(msOf(b)) !== b) return null;
  const range = a <= b ? { from: a, to: b } : { from: b, to: a };
  if (range.to > today) return "future";
  if (daysIn(range) > MAX_REPORT_DAYS) return "too-long";
  return range;
}

// --------------------------------------------------------------- MENYULAR

export function periodMenu(script: Script): { text: string; keyboard: InlineKeyboard } {
  const button = (preset: Preset) => ({ text: inScript(PRESET_LABELS[preset], script), callback_data: `hp:${preset}` });
  return {
    text: inScript(
      `📊 <b>Hisobot</b>\nQaysi davr uchun tayyorlay?\n\n<i>Yozuv: ${script === "cyrl" ? "kirill" : "lotin"}</i>`,
      script,
    ),
    keyboard: [
      [button("today"), button("yday")],
      [button("week"), button("lweek")],
      [button("month"), button("lmonth")],
      [{ text: inScript("📅 Kalendardan tanlash", script), callback_data: `hc:` }],
      [
        {
          text: script === "cyrl" ? "🔤 Lotin yozuviga o'tish" : "🔤 Кирилл ёзувига ўтиш",
          callback_data: "hl",
        },
      ],
    ],
  };
}

const WEEKDAY_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

/**
 * Oy kalendari. [start] tanlangan bo'lsa — u belgilanadi va matn "endi
 * tugash kunini tanlang" deydi. Kelajak kunlari bosilmaydi.
 */
export function calendarView(
  yearMonth: string,
  today: string,
  script: Script,
  start: string | null = null,
): { text: string; keyboard: InlineKeyboard } {
  const [y, m] = yearMonth.split("-").map(Number);
  const first = `${yearMonth}-01`;
  const last = lastDayOfMonth(yearMonth);
  const keyboard: InlineKeyboard = [];

  const startSuffix = start ? `:${start}` : "";
  const prev = shiftMonth(yearMonth, -1);
  const next = shiftMonth(yearMonth, 1);
  keyboard.push([
    { text: "◀️", callback_data: `hc:${prev}${startSuffix}` },
    { text: inScript(`${monthName(m)} ${y}`, script).replace(/^./, (c) => c.toUpperCase()), callback_data: "hn" },
    next <= today.slice(0, 7) ? { text: "▶️", callback_data: `hc:${next}${startSuffix}` } : { text: " ", callback_data: "hn" },
  ]);
  keyboard.push(WEEKDAY_SHORT.map((d) => ({ text: inScript(d, script), callback_data: "hn" })));

  let row: InlineKeyboard[number] = [];
  for (let i = 0; i < weekdayMon(first); i += 1) row.push({ text: " ", callback_data: "hn" });
  for (let key = first; key <= last; key = addDays(key, 1)) {
    const day = Number(key.slice(8));
    if (key > today) {
      row.push({ text: "·", callback_data: "hn" });
    } else if (start && key === start) {
      row.push({ text: `[${day}]`, callback_data: `hd:${start}:${key}` });
    } else {
      row.push({ text: String(day), callback_data: start ? `hd:${start}:${key}` : `hd:${key}` });
    }
    if (row.length === 7) {
      keyboard.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push({ text: " ", callback_data: "hn" });
    keyboard.push(row);
  }

  const bottom = [];
  if (first <= today) bottom.push({ text: inScript("📆 Butun oy", script), callback_data: `hm:${yearMonth}` });
  bottom.push({ text: inScript("⬅️ Orqaga", script), callback_data: "hb" });
  keyboard.push(bottom);

  const text = start
    ? `📅 <b>Kalendar</b>\nBoshlanish: <b>${periodLong(start, start)}</b>\n\nEndi <b>tugash kunini</b> tanlang.\n<i>Bitta kun uchun — shu kunni yana bosing.</i>`
    : `📅 <b>Kalendar</b>\n<b>Boshlanish kunini</b> tanlang.\n\n<i>Butun oy uchun — "Butun oy" tugmasi.</i>`;
  return { text: inScript(text, script), keyboard };
}

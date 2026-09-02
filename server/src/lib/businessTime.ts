/**
 * Biznes (O'zbekiston, UTC+5, yozgi vaqtga o'tish yo'q) mahalliy vaqti
 * bo'yicha yordamchilar — davomat nazorati uchun. Serverning o'zi Render'da
 * qaysi vaqt zonasida ishlashidan qat'i nazar, doim shu qattiq kodlangan
 * ofset bo'yicha hisoblanadi (aniq va bashorat qilinadigan bo'lishi uchun).
 */
const BUSINESS_UTC_OFFSET_MINUTES = 5 * 60;

function toBusinessLocal(date: Date): Date {
  return new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

/** "2026-08-23" ko'rinishida, biznes mahalliy sanasi. */
export function businessDateString(date: Date): string {
  const local = toBusinessLocal(date);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Berilgan payt tegishli bo'lgan biznes-kunning 00:00 boshlanishi, UTC
 * `Date` sifatida — Firestore `Timestamp` bilan taqqoslash uchun. Serverning
 * o'z vaqt zonasiga bog'liq emas (Render UTCda ishlaydi, biznes UTC+5da).
 */
export function businessDayStartUtc(date: Date): Date {
  const local = toBusinessLocal(date);
  const localMidnightMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnightMs - BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

/** Biznes mahalliy kun boshidan (00:00) beri o'tgan daqiqalar soni. */
export function businessMinutesSinceMidnight(date: Date): number {
  const local = toBusinessLocal(date);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Biznes mahalliy vaqtidagi hafta kuni (0=Yakshanba ... 6=Shanba). */
export function businessWeekday(date: Date): number {
  return toBusinessLocal(date).getUTCDay();
}

/** Biznes mahalliy vaqtida "HH:MM" — ko'rsatish uchun. */
export function formatBusinessHHMM(date: Date): string {
  const local = toBusinessLocal(date);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

/** "08:00" -> 480 (daqiqa). Noto'g'ri format bo'lsa null. */
export function parseHHMM(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

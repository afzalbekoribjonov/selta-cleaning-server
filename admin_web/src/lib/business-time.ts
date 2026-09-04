/**
 * Biznes (O'zbekiston, UTC+5, yozgi vaqtga o'tish yo'q) mahalliy vaqti —
 * server/src/lib/businessTime.ts bilan bir xil.
 *
 * Kun chegarasi HAR DOIM shu vaqt bo'yicha aniqlanadi, brauzer vaqt
 * zonasidan emas: davomat yozuvlari va kunlik jurnal serverda aynan shu
 * ofset bilan yoziladi, shuning uchun boshqa zonadan kirilganda "bugun"
 * boshqa kunga surilib ketmasligi kerak.
 *
 * Avval bu yordamchilar `attendance.ts` ichida edi; endi ular kunlik
 * hisobot va buyurtma so'rovlarida ham kerak, shuning uchun alohida.
 */
const BUSINESS_UTC_OFFSET_MINUTES = 5 * 60

function toBusinessLocal(date: Date): Date {
  return new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60_000)
}

/** Biznes vaqti bo'yicha "YYYY-MM-DD". */
export function businessDateKey(date: Date): string {
  const local = toBusinessLocal(date)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Biznes vaqti bo'yicha yarim tundan beri o'tgan daqiqalar. */
export function businessMinutesNow(): number {
  const local = toBusinessLocal(new Date())
  return local.getUTCHours() * 60 + local.getUTCMinutes()
}

/** Berilgan payt tegishli biznes-kunning 00:00 boshlanishi (haqiqiy UTC payti). */
export function businessDayStart(date: Date = new Date()): Date {
  const local = toBusinessLocal(date)
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  return new Date(localMidnight - BUSINESS_UTC_OFFSET_MINUTES * 60_000)
}

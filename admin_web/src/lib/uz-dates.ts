import { businessDateKey } from './business-time'
import { UZ_MONTHS_FULL } from './date-utils'

/**
 * Davr (sana oralig'i) — biznes kuni kalitlari "YYYY-MM-DD" bilan.
 * Kalendar, "Maosh va statistika" va "Chiqimlar" sahifalari shu yerdan.
 * Hisob UTC'da qilinadi: kalit — sof sana, brauzer vaqt zonasi aralashmaydi.
 */
export interface DateRange {
  from: string
  to: string
}

const DAY_MS = 86_400_000

export const todayKey = (): string => businessDateKey(new Date())

const toUtc = (key: string): number => Date.parse(`${key}T00:00:00Z`)
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUtc(v)) && fromUtc(toUtc(v)) === v
}

export function addDays(key: string, n: number): string {
  return fromUtc(toUtc(key) + n * DAY_MS)
}

/** Oraliqdagi kunlar soni (ikkala chekka ham kiradi). */
export function daysInRange(r: DateRange): number {
  return Math.round((toUtc(r.to) - toUtc(r.from)) / DAY_MS) + 1
}

export const UZ_WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']

/** Dushanba = 0 … Yakshanba = 6. */
export function weekdayIndex(key: string): number {
  return (new Date(toUtc(key)).getUTCDay() + 6) % 7
}

export function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return fromUtc(Date.UTC(y, m, 0))
}

export function shiftMonth(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Kalendar oyi: 1-sanadan oy oxirigacha; joriy oyda — bugungacha. */
export function monthRange(yearMonth: string, today = todayKey()): DateRange {
  const last = lastDayOfMonth(yearMonth)
  return { from: `${yearMonth}-01`, to: last > today ? today : last }
}

/** Oraliq butun kalendar oyimi (joriy oyda — 1-sanadan bugungacha)? */
export function monthOf(r: DateRange, today = todayKey()): string | null {
  const ym = r.from.slice(0, 7)
  if (!r.from.endsWith('-01') || r.to.slice(0, 7) !== ym) return null
  return r.to === lastDayOfMonth(ym) || (r.to === today && today.slice(0, 7) === ym) ? ym : null
}

function dayMonth(key: string, withYear: boolean): string {
  const [y, m, d] = key.split('-').map(Number)
  return `${d}-${UZ_MONTHS_FULL[m - 1].toLowerCase()}${withYear ? ` ${y}` : ''}`
}

export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `${UZ_MONTHS_FULL[m - 1]} ${y}`
}

/**
 * Davr matni: "19-noyabr", "3–19-noyabr", "28-oktabr – 3-noyabr",
 * butun oy — "Noyabr 2026". Joriy yildan boshqa yilda yil qo'shiladi.
 */
export function formatRange(r: DateRange, today = todayKey()): string {
  const month = monthOf(r, today)
  if (month) return monthLabel(month)
  const thisYear = today.slice(0, 4)
  const otherYear = r.from.slice(0, 4) !== thisYear || r.to.slice(0, 4) !== thisYear
  if (r.from === r.to) return dayMonth(r.to, otherYear)
  if (r.from.slice(0, 7) === r.to.slice(0, 7)) return `${Number(r.from.slice(8))}–${dayMonth(r.to, otherYear)}`
  return `${dayMonth(r.from, otherYear && r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${dayMonth(r.to, otherYear)}`
}

export interface RangePreset {
  key: string
  label: string
  range: DateRange
}

/** Tez tanlovlar. Hafta dushanbadan boshlanadi. */
export function rangePresets(today = todayKey()): RangePreset[] {
  const monday = addDays(today, -weekdayIndex(today))
  const thisMonth = today.slice(0, 7)
  return [
    { key: 'today', label: 'Bugun', range: { from: today, to: today } },
    { key: 'yesterday', label: 'Kecha', range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { key: 'week', label: 'Shu hafta', range: { from: monday, to: today } },
    { key: 'lastWeek', label: "O'tgan hafta", range: { from: addDays(monday, -7), to: addDays(monday, -1) } },
    { key: 'month', label: 'Shu oy', range: monthRange(thisMonth, today) },
    { key: 'lastMonth', label: "O'tgan oy", range: monthRange(shiftMonth(thisMonth, -1), today) },
  ]
}

export function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to
}

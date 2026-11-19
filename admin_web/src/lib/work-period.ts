import { apiPost } from './api'
import { TARIFF_CONFIG } from './status-config'
import { UNIT_LABELS, formatQty } from './units'
import type { DateRange } from './uz-dates'

/**
 * "Maosh va statistika" — server/src/routes/work.ts (/adminWorkPeriod)
 * javobi. Ish (mahsulot × tarif × hajm) kunlik jurnaldan hisoblanadi,
 * maosh esa server/src/lib/salaryCalc.ts dvigatelidan — bu yerda faqat
 * ko'rsatish uchun yordamchilar.
 */
export type Unit = 'sqm' | 'meter' | 'kg' | 'dona'

export interface WorkLine {
  name: string
  tariff: string
  unit: Unit
  count: number
  amount: number
  price: number
  productId?: string | null
  /**
   * Yuvish/qadoqlash qatorida — mahsulotning 1 birlik ishbay narxi
   * (Mahsulotlar bo'limidan); `null` — narx kiritilmagan.
   */
  rate?: number | null
}

export interface EmployeeWork {
  washed: WorkLine[]
  packed: WorkLine[]
  delivered: WorkLine[]
  returned: WorkLine[]
  /** Qaytgan mahsulotni qayta yuvgani — haq to'lanmaydi, "Yuvildi"ga qo'shilmaydi. */
  rewashed: WorkLine[]
  deliveredMoney: { value: number; collected: number; cash: number; card: number; orders: number }
  onsite: { orders: number; revenue: number; collected: number }
  onsiteTeam: { orders: number; revenue: number }
  created: { orders: number; revenue: number; orderNumbers: number[]; items: WorkLine[] }
  pickedUp: { orders: number; items: number; orderNumbers: number[] }
}

export interface PayLine {
  label: string
  detail: string
  amount: number
}

export interface PayResult {
  method: string
  variable: number
  base: number
  baseIncluded: boolean
  advances: number
  total: number
  lines: PayLine[]
}

export interface SalaryConfig {
  method: string
  params: Record<string, number>
}

export interface WorkEmployee {
  id: string
  fullName: string
  phone: string
  department: string
  status: string
  specializations: string[]
  canPack: boolean
  salary: SalaryConfig | null
  work: EmployeeWork
  pay: PayResult | null
}

export interface ProductStat {
  name: string
  tariff: string
  unit: Unit
  washed: WorkLine | null
  packed: WorkLine | null
  delivered: WorkLine | null
  returned: WorkLine | null
  rewashed: WorkLine | null
}

export interface WorkPeriod {
  from: string
  to: string
  days: number
  month: string | null
  generatedAt: string
  employees: WorkEmployee[]
  products: ProductStat[]
}

export function fetchWorkPeriod(range: DateRange, force = false): Promise<WorkPeriod> {
  return apiPost<WorkPeriod>('/adminWorkPeriod', { from: range.from, to: range.to, ...(force ? { force: true } : {}) })
}

const UNIT_ORDER: Unit[] = ['sqm', 'meter', 'kg', 'dona']

export type Stage = 'washed' | 'packed' | 'delivered' | 'returned' | 'rewashed'

/** Mahsulot narxlari bo'yicha ishbay hisoblanadigan usullar (server: salaryCalc.ts). */
export const PIECEWORK_METHODS = new Set(['washing', 'finishing'])

/**
 * Qator uchun ishbay narxi (1 birlik): `undefined` — bu bosqich xodim
 * maoshiga kirmaydi; `null` — mahsulotga narx kiritilmagan; son — narx.
 * Ishbay usulida xodim o'zi yuvgan VA qadoqlaganiga haq oladi.
 */
export function pieceRate(salary: SalaryConfig | null, stage: Stage, line: WorkLine): number | null | undefined {
  if (!salary || !PIECEWORK_METHODS.has(salary.method)) return undefined
  if (stage !== 'washed' && stage !== 'packed') return undefined
  return line.rate ?? null
}

/** Bosqich bo'yicha birliklar jami: { sqm: 45.5, dona: 3 }. */
export function unitTotals(lines: WorkLine[]): Partial<Record<Unit, number>> {
  const out: Partial<Record<Unit, number>> = {}
  for (const l of lines) out[l.unit] = (out[l.unit] ?? 0) + l.amount
  return out
}

export const countOf = (lines: WorkLine[]): number => lines.reduce((s, l) => s + l.count, 0)

export function hasAnyWork(w: EmployeeWork): boolean {
  return (
    countOf(w.washed) + countOf(w.packed) + countOf(w.delivered) + countOf(w.returned) + countOf(w.rewashed ?? []) > 0 ||
    w.created.orders + w.pickedUp.orders + w.onsite.orders + w.onsiteTeam.orders + w.deliveredMoney.orders > 0
  )
}

/** Tarif bo'yicha guruhlash uchun tartib (Premium birinchi). */
export const TARIFF_ORDER = ['premium', 'express', 'comfort', 'standart', 'none']

const NO_TARIFF = { label: 'Tarifsiz', color: '#7a7482', bg: '#f1eff3' }
export const tariffMeta = (t: string) => TARIFF_CONFIG[t] ?? NO_TARIFF

/** "45,5 m² · 12 metr · 3 dona" — birliklar qo'shilmaydi. */
export function unitsText(lines: WorkLine[]): string {
  const totals = unitTotals(lines)
  return UNIT_ORDER
    .filter((u) => (totals[u] ?? 0) > 0)
    .map((u) => `${formatQty(totals[u]!, u)} ${UNIT_LABELS[u]}`)
    .join(' · ')
}

/** Nomi bo'yicha, bir nomda — tarif tartibida (Premium birinchi). */
export const sortByTariff = (lines: WorkLine[]): WorkLine[] =>
  [...lines].sort((a, b) => a.name.localeCompare(b.name) || TARIFF_ORDER.indexOf(a.tariff) - TARIFF_ORDER.indexOf(b.tariff))

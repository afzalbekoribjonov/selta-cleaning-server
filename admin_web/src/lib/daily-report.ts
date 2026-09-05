import { apiPost } from './api'

/**
 * Kunlik ko'rsatkichlar paneli — server/src/routes/dailyReport.ts
 * javoblarining aynan shakli. Server hamma narsani (birlik nomlari,
 * hajm yig'indilari, xodim ismlari) tayyor holda beradi, shuning uchun
 * bu yerda hech qanday qayta hisoblash yo'q.
 */

export interface UnitTotal {
  unit: string
  /** "m²" / "kg" / "dona" — ko'rsatishga tayyor. */
  label: string
  amount: number
}

/** Bir bosqichdan o'tgan bitta mahsulot (yuvildi / upakovka / yetkazildi). */
export interface ActivityRow {
  id: string
  at: string | null
  orderId: string
  orderNumber: number
  customerName: string
  phone: string
  itemId: string | null
  itemNumber: number | null
  itemName: string
  unit: string
  unitLabel: string
  unitAmount: number
  qty: number | null
  price: number
  employeeId: string
  employeeName: string
  collectedAmount: number | null
  /** Buyurtmaning JORIY umumiy summasi — qator narxi bitta mahsulotniki. */
  orderTotalPrice: number | null
  orderItemCount: number | null
}

export interface StageSummary {
  count: number
  orderCount: number
  totals: UnitTotal[]
  totalPrice: number
  rows: ActivityRow[]
}

export interface IntakeOrderRow {
  orderId: string
  orderNumber: number
  customerName: string
  phone: string
  location: string
  at: string | null
  itemCount: number
  /** `null` — hosila hajm hali hisoblanmagan eski buyurtma. */
  totals: UnitTotal[] | null
  totalPrice: number
  unmeasuredCount: number
  intakeMethod: string | null
  broughtInBy: string
  broughtInByName: string
}

export interface DriverCashRow {
  employeeId: string
  name: string
  amount: number
  itemCount: number
  orderCount: number
  handedOver: boolean
  handedOverAmount: number | null
  handedOverAt: string | null
}

export interface DailyReport {
  date: string
  isToday: boolean
  hasActivityLog: boolean
  intake: {
    orderCount: number
    itemCount: number
    unmeasuredCount: number
    totals: UnitTotal[]
    orders: IntakeOrderRow[]
  }
  washed: StageSummary
  packed: StageSummary
  delivered: StageSummary & { deliveredAmount: number }
  drivers: DriverCashRow[]
}

export interface IntakeItemRow {
  orderId: string
  orderNumber: number
  customerName: string
  phone: string
  at: string | null
  itemId: string
  itemNumber: number | null
  itemName: string
  status: string | null
  tariff: string | null
  unit: string
  unitLabel: string
  unitAmount: number
  qty: number | null
  width: number | null
  height: number | null
  price: number
}

export function fetchDailyReport(date: string): Promise<DailyReport> {
  return apiPost<DailyReport>('/adminDailyReport', { date })
}

export function fetchDailyIntakeItems(date: string): Promise<{
  date: string
  count: number
  totals: UnitTotal[]
  rows: IntakeItemRow[]
}> {
  return apiPost('/adminDailyIntakeItems', { date })
}

/**
 * Kunlik jurnal migratsiyasini `done` kelguncha bo'lakma-bo'lak
 * chaqiradi (server har chaqiruvda cheklangan sondagi buyurtmani qayta
 * ishlaydi). Ish bajarilgan bo'lsa `true` qaytaradi — chaqiruvchi shunda
 * hisobotni qayta so'rashi kerak.
 */
export async function runDailyActivityBackfill(): Promise<boolean> {
  let cursor: string | null = null
  let didWork = false
  // Yuqori chegara: 200 * 150 = 30 000 buyurtma. Cheksiz siklga
  // tushmaslik uchun — server kutilmaganda doim `done: false` qaytarsa.
  for (let i = 0; i < 200; i++) {
    const res: { done: boolean; cursor: string | null; skipped?: boolean; events?: number } = await apiPost(
      '/adminBackfillDailyActivity',
      cursor ? { cursor } : {},
    )
    if (res.skipped) return false
    if ((res.events ?? 0) > 0) didWork = true
    if (res.done || !res.cursor) return didWork
    cursor = res.cursor
  }
  return didWork
}

export function setCashHandover(date: string, employeeId: string, handedOver: boolean, amount?: number) {
  return apiPost('/adminSetCashHandover', { date, employeeId, handedOver, amount })
}

export function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

export function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

/** ISO satridan "14:35" — vaqt biznes zonasida (UTC+5) ko'rsatiladi. */
export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const local = new Date(new Date(iso).getTime() + 5 * 60 * 60_000)
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
}

import { apiPost } from './api'

/** server/src/routes/stats.ts:employeeDailyStats javobi bilan bir xil shakl. */
export interface StatEntry {
  orderId?: string
  orderNumber: number
  customerName: string
  phone?: string
  itemName?: string
  amount?: number
  qty?: number
  calcType?: string
}

export interface UnitTotal {
  unit: string
  amount: number
}

export interface DailyStats {
  date: string
  broughtInToday: { count: number; orders: StatEntry[] }
  washedToday: { count: number; totals: UnitTotal[]; items: StatEntry[] }
  deliveredToday: { count: number; orders: StatEntry[] }
  cashToHandOver: { total: number; entries: StatEntry[] }
  washingNow: { count: number; orderCount: number; items: StatEntry[] }
  readyToDeliver: { count: number; orderCount: number; items: StatEntry[] }
  unmeasured: { count: number; orders: StatEntry[] }
}

export function fetchDailyStats(): Promise<DailyStats> {
  return apiPost<DailyStats>('/employeeDailyStats', {})
}

export function formatQty(entry: StatEntry): string | null {
  if (entry.qty == null || entry.qty <= 0) return null
  const unit =
    entry.calcType === 'sqm' ? 'm²' : entry.calcType === 'meter' ? 'metr' : entry.calcType === 'kg' ? 'kg' : 'dona'
  const q = entry.qty
  return `${Number.isInteger(q) ? q : q.toFixed(1)} ${unit}`
}

export function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export function trimNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

import { useQuery } from '@tanstack/react-query'
import { apiPost } from './api'
import { businessDateKey } from './business-time'

/**
 * Kunlar bo'yicha qisqa ko'rsatkichlar — server/src/lib/dailyStats.ts:
 * DayStats bilan aynan bir xil shakl (/adminDailyTrend). Hisoblash
 * "Kunlik ko'rsatkichlar" (/adminDailyReport) bilan bir xil qoidada.
 */
export type UnitMap = Record<string, number>

export interface StageStats {
  /** Nechta mahsulot. */
  count: number
  orderCount: number
  units: UnitMap
}

export interface DayStats {
  date: string
  intake: { orderCount: number; itemCount: number; units: UnitMap }
  washed: StageStats
  packed: StageStats
  delivered: StageStats & { amount: number; cash: number; card: number }
  /** Kassaga tushgan jami: yetkazish + yopilgan qarz + oldindan to'lov. */
  collected: { amount: number; cash: number; card: number }
}

export function fetchDailyTrend(end: string, days: number): Promise<{ days: DayStats[] }> {
  return apiPost('/adminDailyTrend', { end, days })
}

/** [end] gacha (shu kun ham) [days] kun, eskidan yangiga. */
export function useDailyTrend(end: string, days: number) {
  const todayKey = businessDateKey(new Date())
  return useQuery({
    queryKey: ['dailyTrend', end, days],
    queryFn: () => fetchDailyTrend(end, days).then((r) => r.days),
    // Bugungi kun jonli o'zgaradi, o'tgan oraliq esa deyarli o'zgarmaydi.
    staleTime: end === todayKey ? 60_000 : 10 * 60_000,
  })
}

/** "2026-11-03" + n kun. */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

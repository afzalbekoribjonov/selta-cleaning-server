import { apiPost } from './api'
import { businessDateKey } from './attendance'

/**
 * "Eng faol xodimlar" — endi to'liq serverda hisoblanadi
 * (server/src/routes/employeeActivity.ts).
 *
 * Avval klient buni o'zi qilardi: oxirgi 150 buyurtmaning HAR BIRIGA
 * `items` uchun alohida onSnapshot ochib, ya'ni bitta sahifada yuzdan
 * ortiq jonli obuna. Bu boshqaruv panelidagi eng qimmat joy edi va
 * boshqa hamma joyda olib tashlangan naqshning oxirgi qoldig'i edi.
 */
export interface ActivityRow {
  employeeId: string
  name: string
  ordersCreated: number
  ordersCreatedTotal: number
  pickedUpCount: number
  pickedUpTotal: number
  deliveredCount: number
  deliveredTotal: number
  washedCount: number
  packedCount: number
}

export type RangeKey = 'day' | 'week' | 'month'

/** Tanlangan davr uchun [birinchi kun, oxirgi kun] — biznes vaqti bo'yicha. */
export function rangeDateKeys(range: RangeKey): { from: string; to: string } {
  const to = businessDateKey(new Date())
  const start = new Date()
  if (range === 'week') start.setDate(start.getDate() - 6)
  else if (range === 'month') start.setDate(start.getDate() - 29)
  return { from: businessDateKey(start), to }
}

export function fetchEmployeeActivity(from: string, to: string): Promise<{ from: string; to: string; rows: ActivityRow[] }> {
  return apiPost('/adminEmployeeActivity', { from, to })
}

export type DeptKey = 'delivery' | 'worker' | 'dispatcher'

export const DEPT_TABS: { key: DeptKey; label: string }[] = [
  { key: 'delivery', label: 'Dastavchik' },
  { key: 'worker', label: 'Ishchi' },
  { key: 'dispatcher', label: 'Sotuv menejeri' },
]

/** Tab bo'yicha saralash mezoni — shu ko'rsatkichi 0 bo'lgan xodim ro'yxatga kirmaydi. */
export function primaryMetric(dept: DeptKey, r: ActivityRow): number {
  if (dept === 'delivery') return r.pickedUpCount + r.deliveredCount
  if (dept === 'worker') return r.washedCount + r.packedCount
  return r.ordersCreated
}

/** Tanlangan bo'lim bo'yicha faol xodimlar, kattadan kichikka. */
export function sortedForDept(rows: ActivityRow[], dept: DeptKey): ActivityRow[] {
  return rows
    .filter((r) => primaryMetric(dept, r) > 0)
    .sort((a, b) => primaryMetric(dept, b) - primaryMetric(dept, a))
}

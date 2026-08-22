import type { Order } from './orders'
import type { StatsItem } from '@/hooks/useAllOrderItems'

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
  qcCount: number
}

function inRange(date: Date | undefined, start: Date, end: Date): boolean {
  if (!date) return false
  return date >= start && date < end
}

/**
 * Har bir xodim uchun berilgan sana oralig'idagi faolligini hisoblaydi —
 * "Eng faol xodimlar" (Dashboard kunlik, Statistika kunlik/haftalik/
 * oylik) uchun umumiy manba. Xodimning "bo'limi" bu yerda tekshirilmaydi
 * — masalan sotuv menejeri metrikasi faqat createdBy'ga, dastavchik
 * metrikasi pickedUpBy/deliveredBy'ga qarab hisoblanadi, shuning uchun
 * har bir metrika tabida faqat shu turdagi faolligi bo'lgan xodimlar
 * ko'rinadi — xodimlar jadvali bilan qayta bog'lash shart emas.
 */
export function computeEmployeeActivity(
  orders: Order[],
  itemsByOrder: Record<string, StatsItem[]>,
  employees: Record<string, string>,
  start: Date,
  end: Date,
): Record<string, ActivityRow> {
  const rows: Record<string, ActivityRow> = {}
  function ensure(id: string): ActivityRow {
    if (!rows[id]) {
      rows[id] = {
        employeeId: id,
        name: employees[id] ?? "Noma'lum xodim",
        ordersCreated: 0,
        ordersCreatedTotal: 0,
        pickedUpCount: 0,
        pickedUpTotal: 0,
        deliveredCount: 0,
        deliveredTotal: 0,
        washedCount: 0,
        qcCount: 0,
      }
    }
    return rows[id]
  }

  for (const o of orders) {
    if (o.createdBy && inRange(o.createdAt, start, end)) {
      const r = ensure(o.createdBy)
      r.ordersCreated++
      r.ordersCreatedTotal += o.totalPrice
    }
    if (o.pickedUpBy && inRange(o.pickedUpAt, start, end)) {
      const r = ensure(o.pickedUpBy)
      r.pickedUpCount++
      r.pickedUpTotal += o.totalPrice
    }

    const items = itemsByOrder[o.id] ?? []
    for (const item of items) {
      if (item.washedBy && inRange(item.washedAt, start, end)) {
        ensure(item.washedBy).washedCount++
      }
      if (item.qcBy && inRange(item.qcAt, start, end)) {
        ensure(item.qcBy).qcCount++
      }
      if (item.deliveredBy && inRange(item.deliveredAt, start, end)) {
        const r = ensure(item.deliveredBy)
        r.deliveredCount++
        r.deliveredTotal += item.price
      }
    }
  }

  return rows
}

export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function startOfYesterday(): Date {
  const d = startOfToday()
  d.setDate(d.getDate() - 1)
  return d
}

export type RangeKey = 'day' | 'week' | 'month'

export function rangeStart(key: RangeKey): Date {
  if (key === 'day') return startOfToday()
  const d = startOfToday()
  if (key === 'week') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  return d
}

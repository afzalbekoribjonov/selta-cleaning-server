import type { Order } from './orders'
import type { StatsItem } from '@/hooks/useAllOrderItems'

/**
 * admin_web/src/lib/order-tariffs.ts bilan bir xil — pickup buyurtmalarda
 * tarif/muddat item-darajasiga ko'chirilgan (server: createOrder),
 * order.tariff/order.dueDate faqat onsite uchun mavjud.
 */
export function distinctTariffs(order: Order, items: StatsItem[]): string[] {
  if (order.serviceType === 'onsite') return order.tariff ? [order.tariff] : []
  const set = new Set<string>()
  for (const item of items) if (item.tariff) set.add(item.tariff)
  return Array.from(set)
}

function earliestPendingDueDate(items: StatsItem[]): Date | null {
  const dates = items.filter((i) => i.status !== 'done' && i.dueDate).map((i) => i.dueDate!)
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a < b ? a : b))
}

export function effectiveDueDate(order: Order, items: StatsItem[]): Date | null {
  if (order.serviceType === 'onsite') return order.dueDate
  return earliestPendingDueDate(items)
}

export function isOrderOverdue(order: Order, items: StatsItem[]): boolean {
  if (order.status === 'done') return false
  const due = effectiveDueDate(order, items)
  if (!due) return false
  return new Date() > due
}

/**
 * Muddatgacha qolgan to'liq kunlar soni — manfiy bo'lsa kechikkan.
 * Kun chegarasi bo'yicha hisoblanadi (soat-daqiqa emas), shunda
 * "bugun" = 0, "ertaga" = 1 bo'ladi.
 */
export function daysUntil(due: Date): number {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDue = new Date(due)
  startOfDue.setHours(0, 0, 0, 0)
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000)
}

/** "Bugun" / "Ertaga" / "3 kun qoldi" / "2 kun kechikdi". */
export function dueLabel(due: Date): string {
  const d = daysUntil(due)
  if (d === 0) return 'Bugun'
  if (d === 1) return 'Ertaga'
  if (d > 1) return `${d} kun qoldi`
  return `${Math.abs(d)} kun kechikdi`
}

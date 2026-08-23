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

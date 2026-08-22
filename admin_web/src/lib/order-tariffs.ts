import type { Order } from './orders'
import type { StatsItem } from '@/hooks/useAllOrderItems'

/**
 * Pickup buyurtmalarda tarif/muddat item-darajasiga ko'chirilgan (server:
 * createOrder) — order.tariff/order.dueDate faqat onsite uchun mavjud.
 * Bu yordamchilar buyurtmalar ro'yxatida (OrdersPage, DashboardPage)
 * item'lardan hisoblab, bir xil "Tarif"/"Muddat" ustunlarini to'ldirish
 * uchun ishlatiladi — ikkala sahifa ham bir xil mantiqni ishlatishi
 * kerak, shuning uchun shu yerda markazlashtirilgan.
 */

/** Buyurtmadagi barcha (takrorlanmagan) tariflar — onsite uchun bitta
 * (order-level), pickup uchun itemlardan yig'iladi. */
export function distinctTariffs(order: Order, items: StatsItem[]): string[] {
  if (order.serviceType === 'onsite') return order.tariff ? [order.tariff] : []
  const set = new Set<string>()
  for (const item of items) if (item.tariff) set.add(item.tariff)
  return Array.from(set)
}

/** Hali yakunlanmagan (status !== 'done') itemlar orasida eng yaqin
 * (eng shoshilinchi) muddatni topadi — talab: "eng birinchi kuni yaqin
 * mahsulotni sanasini ko'rsatish". */
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

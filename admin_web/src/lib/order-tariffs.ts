import type { Order } from './orders'

/**
 * Pickup buyurtmalarda tarif/muddat ITEM darajasida (server: createOrder).
 * Avval bu yordamchilar har bir buyurtmaning `items` pastki jamlanmasini
 * o'qishni talab qilardi — ro'yxatda yuzlab buyurtma bo'lganda bu minglab
 * Firestore o'qishiga aylanib, kunlik limitni tugatib qo'ydi.
 *
 * Endi server mahsulot o'zgarganda kerakli qiymatlarni buyurtma hujjatiga
 * yozib qo'yadi (lib/orderSummary.ts), bu yerda esa faqat o'qiladi —
 * qo'shimcha so'rovsiz.
 */

/** Buyurtmadagi takrorlanmagan tariflar. */
export function distinctTariffs(order: Order): string[] {
  if (order.serviceType === 'onsite') return order.tariff ? [order.tariff] : []
  return order.itemTariffs
}

/** Hali yakunlanmagan mahsulotlar orasidagi eng yaqin muddat. */
export function effectiveDueDate(order: Order): Date | null {
  if (order.serviceType === 'onsite') return order.dueDate
  return order.earliestPendingDueDate
}

export function isOrderOverdue(order: Order): boolean {
  if (order.status === 'done') return false
  const due = effectiveDueDate(order)
  if (!due) return false
  return new Date() > due
}

/**
 * Muddatgacha qolgan to'liq kunlar soni — manfiy bo'lsa kechikkan.
 * Kun chegarasi bo'yicha: bugun = 0, ertaga = 1.
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

/** Tarif ustuvorligi: Premium va Express muddati bir xil, lekin Premium oldinda. */
export const TARIFF_RANK: Record<string, number> = { premium: 0, express: 1, comfort: 2, standart: 3 }
export const TARIFF_DISPLAY_ORDER = ['premium', 'express', 'comfort', 'standart']

const normTariff = (t: string | null | undefined) => (t === 'standard' ? 'standart' : (t ?? ''))

/**
 * Kartadagi tarif ko'rsatkichlari: {premium: 1, express: 2}. Faol
 * buyurtmada — topshirilmagan mahsulotlar, yakunlanganda — hammasi.
 * Mahsulotsiz (joyida yuvish) — buyurtma tarifi, soni 0.
 */
export function tariffCountsOf(order: Order): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const m of order.itemMarks) {
    if (order.status !== 'done' && m.status === 'done') continue
    const t = normTariff(m.tariff ?? order.tariff)
    if (t in TARIFF_RANK) counts[t] = (counts[t] ?? 0) + 1
  }
  if (Object.keys(counts).length === 0 && order.itemMarks.length === 0) {
    const t = normTariff(order.tariff)
    if (t in TARIFF_RANK) counts[t] = 0
    else for (const x of order.itemTariffs) if (x in TARIFF_RANK) counts[x] = 0
  }
  return counts
}

export function bestTariffRank(order: Order): number {
  return Math.min(99, ...Object.keys(tariffCountsOf(order)).map((t) => TARIFF_RANK[t] ?? 99))
}

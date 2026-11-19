import { STATUS_CONFIG } from './status-config'
import type { Order } from './orders'
import { warehouseItemCount } from './warehouse'

/**
 * Buyurtmalar ro'yxatidagi holat filtri.
 *
 * MUAMMO: olib kelish buyurtmasi butun umri davomida "Sexga keldi"
 * holatida turadi — yuvish, upakovka va yetkazish MAHSULOT darajasida
 * kechadi. Shuning uchun buyurtmaning `status` maydoni bo'yicha
 * filtrlash deyarli hech narsa bermasdi: qaysi holat tanlansa ham
 * ro'yxat "Sexga keldi"da qotib qolardi.
 *
 * YECHIM: filtr ikki qamrovga bo'lindi. "Mahsulot holati" tanlansa,
 * buyurtmada SHU holatdagi kamida bitta mahsulot bor-yo'qligi
 * tekshiriladi — buning uchun buyurtmada allaqachon saqlanadigan
 * `itemStatusCounts` hosila maydoni ishlatiladi, ya'ni bitta ham
 * qo'shimcha Firestore o'qishi kerak emas.
 */
export type FilterScope = 'item' | 'order'

/** Filtr qiymati "item:washing" / "order:new" ko'rinishida — 'done' ikkala qamrovda ham bor. */
export interface StatusFilterOption {
  value: string
  label: string
}

const ITEM_STATUSES = ['pending', 'washing', 'packing', 'ready', 'returned', 'done'] as const
const ORDER_STATUSES = ['new', 'picked_up', 'brought_in', 'team_assigned', 'in_progress', 'done'] as const

/**
 * "Omborda" — tayyor bo'lganiga chegara kundan oshgan mahsulotlar. Ular
 * "Tayyor"da sanalmaydi (faol ro'yxatlar va ko'rsatkichlardan chiqadi).
 */
export const ITEM_STATUS_OPTIONS: StatusFilterOption[] = ITEM_STATUSES.flatMap((s) => {
  const option = { value: `item:${s}`, label: STATUS_CONFIG[s]?.label ?? s }
  return s === 'ready' ? [option, { value: 'item:warehouse', label: 'Omborda' }] : [option]
})

export const ORDER_STATUS_OPTIONS: StatusFilterOption[] = ORDER_STATUSES.map((s) => ({
  value: `order:${s}`,
  label: STATUS_CONFIG[s]?.label ?? s,
}))

export function parseStatusFilter(value: string): { scope: FilterScope; status: string } | null {
  const [scope, status] = value.split(':')
  if ((scope !== 'item' && scope !== 'order') || !status) return null
  return { scope, status }
}

/** Mahsulot holatidagi soni; "Tayyor" — ombordagilarsiz, "Omborda" — faqat ular. */
function itemCountFor(order: Order, status: string, warehouseDays: number): number {
  if (status === 'warehouse') return warehouseItemCount(order, warehouseDays)
  const n = order.itemStatusCounts[status] ?? 0
  return status === 'ready' ? Math.max(0, n - warehouseItemCount(order, warehouseDays)) : n
}

export function orderMatchesStatus(order: Order, filter: { scope: FilterScope; status: string }, warehouseDays: number): boolean {
  if (filter.scope === 'order') return order.status === filter.status
  return itemCountFor(order, filter.status, warehouseDays) > 0
}

/**
 * Mahsulot holati bo'yicha filtrlanganda — shu buyurtmada nechta
 * mahsulot mos kelgani. Ro'yxatda ko'rsatiladi, aks holda foydalanuvchi
 * buyurtma nima uchun ro'yxatga tushganini bilmaydi.
 */
export function matchedItemCount(order: Order, filter: { scope: FilterScope; status: string } | null, warehouseDays: number): number | null {
  if (!filter || filter.scope !== 'item') return null
  return itemCountFor(order, filter.status, warehouseDays)
}

export function statusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status
}

/**
 * Olib kelish buyurtmasi mahsulotlari qayerda — "2/4 tayyor · 1 yuvilmoqda".
 *
 * Buyurtmaning o'zi butun umri "Sexga keldi"da turadi, shuning uchun
 * ro'yxatlarda u hech narsa aytmaydi; haqiqiy holat mahsulotlarda
 * (`itemStatusCounts` — qo'shimcha o'qishsiz). Mahsuloti yo'q yoki joyida
 * yuvish buyurtmasida `null` (buyurtma holati ko'rsatiladi).
 */
export function itemProgressLabel(order: Order): string | null {
  if (order.serviceType !== 'pickup') return null
  const c = order.itemStatusCounts
  const total = Object.values(c).reduce((s, n) => s + n, 0)
  if (total === 0) return null
  const ready = (c.ready ?? 0) + (c.done ?? 0)
  const parts = [`${ready}/${total} tayyor`]
  if (c.washing) parts.push(`${c.washing} yuvilmoqda`)
  if (c.packing) parts.push(`${c.packing} upakovkada`)
  if (c.returned) parts.push(`${c.returned} qayta ishlovda`)
  if (c.pending) parts.push(`${c.pending} navbatda`)
  return parts.join(' · ')
}

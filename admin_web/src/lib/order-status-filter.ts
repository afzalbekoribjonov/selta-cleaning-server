import { STATUS_CONFIG } from './status-config'
import type { Order } from './orders'

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
const ORDER_STATUSES = ['new', 'brought_in', 'team_assigned', 'in_progress', 'done'] as const

export const ITEM_STATUS_OPTIONS: StatusFilterOption[] = ITEM_STATUSES.map((s) => ({
  value: `item:${s}`,
  label: STATUS_CONFIG[s]?.label ?? s,
}))

export const ORDER_STATUS_OPTIONS: StatusFilterOption[] = ORDER_STATUSES.map((s) => ({
  value: `order:${s}`,
  label: STATUS_CONFIG[s]?.label ?? s,
}))

export function parseStatusFilter(value: string): { scope: FilterScope; status: string } | null {
  const [scope, status] = value.split(':')
  if ((scope !== 'item' && scope !== 'order') || !status) return null
  return { scope, status }
}

export function orderMatchesStatus(order: Order, filter: { scope: FilterScope; status: string }): boolean {
  if (filter.scope === 'order') return order.status === filter.status
  return (order.itemStatusCounts[filter.status] ?? 0) > 0
}

/**
 * Mahsulot holati bo'yicha filtrlanganda — shu buyurtmada nechta
 * mahsulot mos kelgani. Ro'yxatda ko'rsatiladi, aks holda foydalanuvchi
 * buyurtma nima uchun ro'yxatga tushganini bilmaydi.
 */
export function matchedItemCount(order: Order, filter: { scope: FilterScope; status: string } | null): number | null {
  if (!filter || filter.scope !== 'item') return null
  return order.itemStatusCounts[filter.status] ?? 0
}

export function statusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status
}

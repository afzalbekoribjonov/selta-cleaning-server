import { type Order } from '@/lib/orders'
import { itemProgressLabel } from '@/lib/order-status-filter'
import { StatusBadge } from '@/components/ui/StatusBadge'

/** Ro'yxatdagi rang tartibi — tayyordan navbatgacha. */
const SEGMENTS: { key: string; color: string }[] = [
  { key: 'done', color: '#1e9e5a' },
  { key: 'ready', color: '#4cc38a' },
  { key: 'packing', color: '#f59e0b' },
  { key: 'washing', color: '#2f80d6' },
  { key: 'returned', color: '#dc2626' },
  { key: 'pending', color: '#d9d3e0' },
]

/**
 * Buyurtma qayerda — ro'yxat qatorlari uchun.
 *
 * Olib kelish buyurtmasi sexga kelgach butun umri "Sexga keldi"da
 * turadi, shuning uchun uning o'rniga mahsulotlar holati ko'rsatiladi:
 * rangli chiziq va "2/4 tayyor · 1 yuvilmoqda". Qolgan holatlarda
 * (yangi, yo'lda, yakunlangan, joyida yuvish) — oddiy holat belgisi.
 */
export function OrderProgress({ order }: { order: Order }) {
  const label = order.status === 'brought_in' ? itemProgressLabel(order) : null
  if (!label) return <StatusBadge status={order.status} />

  const counts = order.itemStatusCounts
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  return (
    <span className="block min-w-0 max-w-[260px]">
      <span className="flex h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden>
        {SEGMENTS.map((s) =>
          counts[s.key] ? <span key={s.key} style={{ width: `${(counts[s.key] / total) * 100}%`, backgroundColor: s.color }} /> : null,
        )}
      </span>
      <span className="mt-1 block text-[11.5px] font-semibold leading-snug text-gray-dark">{label}</span>
    </span>
  )
}

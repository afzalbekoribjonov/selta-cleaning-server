import { useMemo, useState } from 'react'
import { Search, AlertTriangle, Clock, History, CalendarClock, ArrowUp, ArrowDown } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useAllOrderItems } from '@/hooks/useAllOrderItems'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import type { Order } from '@/lib/orders'
import { formatDateUz } from '@/lib/date-utils'
import { formatPhoneDisplay } from '@/lib/phone'
import { StatusBadge, TariffDots } from '@/components/Badge'
import { Spinner } from '@/components/Spinner'
import { OrderDetailDrawer } from '@/components/OrderDetailDrawer'

type SortKey = 'latest' | 'earliest' | 'deadline' | 'expensive' | 'cheap'
const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof Clock }[] = [
  { key: 'latest', label: 'Oxirgilar', icon: Clock },
  { key: 'earliest', label: 'Birinchilar', icon: History },
  { key: 'deadline', label: 'Muddat', icon: CalendarClock },
  { key: 'expensive', label: 'Qimmat', icon: ArrowUp },
  { key: 'cheap', label: 'Arzon', icon: ArrowDown },
]

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function ActiveOrdersPage() {
  const { orders, loading } = useRecentOrders()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('latest')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  const baseOrders = useMemo(() => orders.filter((o) => o.status !== 'done'), [orders])
  const pickupOrderIds = useMemo(() => baseOrders.filter((o) => o.serviceType === 'pickup').map((o) => o.id), [baseOrders])
  const itemsByOrder = useAllOrderItems(pickupOrderIds)

  const filtered = useMemo(() => {
    let list = baseOrders
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          o.phone.toLowerCase().includes(q) ||
          o.orderNumber.toString().includes(q),
      )
    }
    if (overdueOnly) list = list.filter((o) => isOrderOverdue(o, itemsByOrder[o.id] ?? []))

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'earliest':
          return a.createdAt.getTime() - b.createdAt.getTime()
        case 'expensive':
          return b.totalPrice - a.totalPrice
        case 'cheap':
          return a.totalPrice - b.totalPrice
        case 'deadline': {
          const da = effectiveDueDate(a, itemsByOrder[a.id] ?? [])
          const db = effectiveDueDate(b, itemsByOrder[b.id] ?? [])
          if (!da && !db) return b.createdAt.getTime() - a.createdAt.getTime()
          if (!da) return 1
          if (!db) return -1
          return da.getTime() - db.getTime()
        }
        default:
          return b.createdAt.getTime() - a.createdAt.getTime()
      }
    })
    return list
  }, [baseOrders, search, overdueOnly, sortBy, itemsByOrder])

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-ink">Faol buyurtmalar</h1>
          <p className="mt-1 text-sm text-gray-dark">{filtered.length} ta buyurtma</p>
        </div>
        <div className="relative w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dark" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki # bo'yicha qidirish"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {SORT_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.key}
            label={opt.label}
            icon={opt.icon}
            active={sortBy === opt.key}
            onClick={() => setSortBy(opt.key)}
          />
        ))}
        <div className="mx-1 h-5 w-px bg-border" />
        <FilterChip
          label="Kechikkan"
          color="#DC2626"
          icon={AlertTriangle}
          active={overdueOnly}
          onClick={() => setOverdueOnly((v) => !v)}
        />
      </div>

      {loading ? (
        <Spinner className="py-16" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-sm font-bold text-gray-dark">Buyurtmalar topilmadi</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/60 text-left text-xs font-bold uppercase tracking-wide text-gray-dark">
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Mijoz</th>
                <th className="px-5 py-3">Telefon</th>
                <th className="px-5 py-3">Xizmat</th>
                <th className="px-5 py-3">Holat</th>
                <th className="px-5 py-3">Tarif</th>
                <th className="px-5 py-3">Muddat</th>
                <th className="px-5 py-3 text-right">Summa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  items={itemsByOrder[order.id] ?? []}
                  onClick={() => setOpenOrderId(order.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openOrderId && <OrderDetailDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </div>
  )
}

function OrderRow({
  order,
  items,
  onClick,
}: {
  order: Order
  items: ReturnType<typeof useAllOrderItems>[string]
  onClick: () => void
}) {
  const overdue = isOrderOverdue(order, items ?? [])
  const dueDate = effectiveDueDate(order, items ?? [])
  return (
    <tr onClick={onClick} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg/60">
      <td className="px-5 py-3.5 font-extrabold text-brand-primary">#{order.orderNumber}</td>
      <td className="px-5 py-3.5 font-bold text-ink">{order.customerName || "Noma'lum"}</td>
      <td className="px-5 py-3.5 text-ink">{formatPhoneDisplay(order.phone)}</td>
      <td className="px-5 py-3.5 text-ink">{order.serviceType === 'onsite' ? 'Joyida' : 'Olib kelish'}</td>
      <td className="px-5 py-3.5">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-5 py-3.5">
        <TariffDots tariffs={distinctTariffs(order, items ?? [])} />
      </td>
      <td className="px-5 py-3.5">
        {dueDate ? (
          <span className={overdue ? 'font-bold text-danger' : 'text-ink'}>
            {formatDateUz(dueDate)}
            {overdue && ' · kechikmoqda'}
          </span>
        ) : (
          <span className="text-gray-dark">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right font-extrabold text-brand-primary">{formatMoney(order.totalPrice)}</td>
    </tr>
  )
}

function FilterChip({
  label,
  active,
  color,
  icon: Icon,
  onClick,
}: {
  label: string
  active: boolean
  color?: string
  icon?: typeof AlertTriangle
  onClick: () => void
}) {
  const c = color ?? '#5A148C'
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
      style={active ? { background: c, color: 'white' } : { background: 'var(--color-surface)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  )
}

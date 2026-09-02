import { useMemo, useState } from 'react'
import { Search, Clock, History, CalendarClock, ArrowUp, ArrowDown, Home, Truck, Store, LayoutGrid, Users } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useAllOrderItems } from '@/hooks/useAllOrderItems'
import { distinctTariffs, effectiveDueDate, isOrderOverdue, dueLabel, daysUntil } from '@/lib/order-tariffs'
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

type ServiceFilter = 'all' | 'onsite' | 'pickup' | 'walkin'
const SERVICE_FILTERS: { key: ServiceFilter; label: string; icon: typeof Home }[] = [
  { key: 'all', label: 'Barchasi', icon: LayoutGrid },
  { key: 'onsite', label: 'Joyida yuvish', icon: Home },
  { key: 'pickup', label: 'Olib kelish', icon: Truck },
  { key: 'walkin', label: "O'zi keldi", icon: Store },
]

/** "O'zi keldi" — pickup buyurtma, lekin dastavchiksiz (server: intakeMethod). */
function matchesService(order: Order, filter: ServiceFilter): boolean {
  switch (filter) {
    case 'onsite':
      return order.serviceType === 'onsite'
    case 'pickup':
      return order.serviceType === 'pickup' && order.intakeMethod !== 'walk_in'
    case 'walkin':
      return order.intakeMethod === 'walk_in'
    default:
      return true
  }
}

/** Jamoa biriktirilmagan joyida-yuvish buyurtmasi — e'tibor talab qiladi. */
function needsTeam(order: Order): boolean {
  return order.serviceType === 'onsite' && order.status === 'new' && (order.assignedTeam?.length ?? 0) === 0
}

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function ActiveOrdersPage() {
  const { orders, activeOrders, loading } = useRecentOrders()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('latest')
  const [service, setService] = useState<ServiceFilter>('all')
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  const query = search.trim().toLowerCase()

  // Talab: "yetgazilgan (yakunlangan) buyurtmalar ham qidiruv orqali
  // qidirilganda ko'rinsin" — qidiruv paytida yakunlanganlari bilan
  // birlashtirilgan ro'yxat bo'ylab qidiriladi, aks holda faqat faollar.
  const baseOrders = query ? orders : activeOrders

  const pickupOrderIds = useMemo(
    () => baseOrders.filter((o) => o.serviceType === 'pickup').map((o) => o.id),
    [baseOrders],
  )
  const itemsByOrder = useAllOrderItems(pickupOrderIds)

  const searched = useMemo(() => {
    if (!query) return baseOrders
    return baseOrders.filter(
      (o) =>
        o.customerName.toLowerCase().includes(query) ||
        o.phone.toLowerCase().includes(query) ||
        o.orderNumber.toString().includes(query),
    )
  }, [baseOrders, query])

  // Filtr tugmalaridagi sonlar joriy qidiruvga mos keladi (filtrning
  // o'zidan oldingi holat), shunda son har doim "bosilsa nechta chiqadi"ni
  // ko'rsatadi.
  const counts = useMemo(() => {
    const c: Record<ServiceFilter, number> = { all: 0, onsite: 0, pickup: 0, walkin: 0 }
    for (const o of searched) {
      c.all += 1
      if (matchesService(o, 'onsite')) c.onsite += 1
      else if (matchesService(o, 'walkin')) c.walkin += 1
      else if (matchesService(o, 'pickup')) c.pickup += 1
    }
    return c
  }, [searched])

  const filtered = useMemo(() => {
    const list = searched.filter((o) => matchesService(o, service))
    return [...list].sort((a, b) => {
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
  }, [searched, service, sortBy, itemsByOrder])

  const unassignedCount = useMemo(() => activeOrders.filter(needsTeam).length, [activeOrders])

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex items-center justify-between gap-6">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-ink">Faol buyurtmalar</h1>
          <p className="mt-1 text-sm text-gray-dark">
            {filtered.length} ta buyurtma
            {query && <span className="ml-1 text-brand-primary">· qidiruvda yakunlanganlar ham bor</span>}
          </p>
        </div>
        <div className="relative w-80 shrink-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dark" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki # bo'yicha qidirish"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      </div>

      {unassignedCount > 0 && (
        <button
          onClick={() => {
            setService('onsite')
            setSortBy('latest')
          }}
          className="mb-5 flex w-full animate-pulse items-center gap-3 rounded-2xl border-[1.5px] border-danger bg-danger-bg px-4 py-3 text-left"
        >
          <Users size={18} className="shrink-0 text-danger" />
          <span className="text-sm font-extrabold text-danger">
            {unassignedCount} ta joyida-yuvish buyurtmasiga jamoa biriktirilmagan
          </span>
          <span className="ml-auto text-xs font-bold text-danger/80">Ko'rish →</span>
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SERVICE_FILTERS.map((f) => (
          <ServiceChip
            key={f.key}
            label={f.label}
            icon={f.icon}
            count={counts[f.key]}
            active={service === f.key}
            onClick={() => setService(f.key)}
          />
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-bold text-gray-dark">Saralash:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              sortBy === opt.key
                ? 'bg-brand-primary text-white'
                : 'border border-border bg-surface text-ink hover:border-brand-primary/40'
            }`}
          >
            <opt.icon size={13} />
            {opt.label}
          </button>
        ))}
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
  const alert = needsTeam(order)
  const serviceLabel =
    order.intakeMethod === 'walk_in' ? "O'zi keldi" : order.serviceType === 'onsite' ? 'Joyida' : 'Olib kelish'
  const remaining = dueDate ? daysUntil(dueDate) : null

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b border-border last:border-0 hover:bg-bg/60 ${alert ? 'bg-danger-bg/40' : ''}`}
    >
      <td className="px-5 py-3.5 font-extrabold text-brand-primary">#{order.orderNumber}</td>
      <td className="px-5 py-3.5">
        <div className="font-bold text-ink">{order.customerName || "Noma'lum"}</div>
        {alert && (
          <div className="mt-0.5 inline-flex animate-pulse items-center gap-1 text-[11px] font-extrabold text-danger">
            <Users size={11} />
            Jamoa biriktirilmagan
          </div>
        )}
      </td>
      <td className="px-5 py-3.5 text-ink">{formatPhoneDisplay(order.phone)}</td>
      <td className="px-5 py-3.5 text-ink">{serviceLabel}</td>
      <td className="px-5 py-3.5">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-5 py-3.5">
        <TariffDots tariffs={distinctTariffs(order, items ?? [])} />
      </td>
      <td className="px-5 py-3.5">
        {dueDate ? (
          <div>
            <div className={overdue ? 'font-bold text-danger' : 'text-ink'}>{formatDateUz(dueDate)}</div>
            <div
              className={`text-[11px] font-bold ${
                overdue ? 'text-danger' : remaining !== null && remaining <= 1 ? 'text-warning' : 'text-gray-dark'
              }`}
            >
              {dueLabel(dueDate)}
            </div>
          </div>
        ) : (
          <span className="text-gray-dark">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right font-extrabold text-brand-primary">{formatMoney(order.totalPrice)}</td>
    </tr>
  )
}

function ServiceChip({
  label,
  icon: Icon,
  count,
  active,
  onClick,
}: {
  label: string
  icon: typeof Home
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-2.5 text-sm font-bold transition-colors ${
        active
          ? 'border-brand-primary bg-brand-primary text-white'
          : 'border-border bg-surface text-ink hover:border-brand-primary/40'
      }`}
    >
      <Icon size={15} />
      {label}
      <span
        className={`absolute -right-1.5 -top-1.5 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
          active ? 'bg-brand-accent text-brand-primary-dark' : 'bg-brand-primary text-white'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

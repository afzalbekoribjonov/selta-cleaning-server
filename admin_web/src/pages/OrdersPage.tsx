import { useMemo, useState } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useAllOrderItems } from '@/hooks/useAllOrderItems'
import { fetchOrdersPage, type Order, type QueryDocumentSnapshot } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import { STATUS_CONFIG } from '@/lib/status-config'
import { StatusBadge, TariffDots } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDateUz } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

type SortKey = 'latest' | 'earliest' | 'expensive' | 'cheap'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: 'Oxirgilar' },
  { key: 'earliest', label: 'Boshidagilar' },
  { key: 'expensive', label: 'Eng qimmat' },
  { key: 'cheap', label: 'Eng arzon' },
]

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function OrdersPage() {
  const [view, setView] = useState<'active' | 'all'>('active')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('latest')
  const [monthFilter, setMonthFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const { orders: recentOrders, loading } = useRecentOrders()

  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadAllOrders(reset = false) {
    setLoadingMore(true)
    try {
      const { orders: page, lastDoc, hasMore: more } = await fetchOrdersPage(reset ? undefined : (cursor ?? undefined))
      setAllOrders((prev) => (reset ? page : [...prev, ...page]))
      setCursor(lastDoc)
      setHasMore(more)
    } finally {
      setLoadingMore(false)
    }
  }

  function switchView(next: 'active' | 'all') {
    setView(next)
    if (next === 'all' && allOrders.length === 0) {
      void loadAllOrders(true)
    }
  }

  const baseOrders = view === 'active' ? (recentOrders ?? []).filter((o) => o.status !== 'done') : allOrders

  // Talab: pickup buyurtmalarda tarif/muddat item-darajasida — ro'yxatda
  // to'g'ri ko'rsatish uchun har bir buyurtmaning itemlarini kuzatish kerak.
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
    if (statusFilter) list = list.filter((o) => o.status === statusFilter)
    if (monthFilter) {
      list = list.filter((o) => {
        const ym = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}`
        return ym === monthFilter
      })
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
        default:
          return b.createdAt.getTime() - a.createdAt.getTime()
      }
    })
    return list
  }, [baseOrders, search, statusFilter, monthFilter, overdueOnly, sortBy, itemsByOrder])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Buyurtmalar</h1>
          <p className="mt-1 text-sm text-gray-dark">
            {view === 'active' ? "Faol buyurtmalar (yakunlanmagan)" : 'Barcha buyurtmalar tarixi'}
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1">
          <button
            onClick={() => switchView('active')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${view === 'active' ? 'bg-brand-primary text-white' : 'text-ink/70'}`}
          >
            Faol
          </button>
          <button
            onClick={() => switchView('all')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${view === 'all' ? 'bg-brand-primary text-white' : 'text-ink/70'}`}
          >
            Barchasi
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki # bo'yicha qidirish"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
        >
          <option value="">Barcha holat</option>
          {Object.entries(STATUS_CONFIG).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          max={currentYearMonth()}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
        />
        {monthFilter && (
          <button onClick={() => setMonthFilter('')} className="text-xs font-bold text-brand-primary hover:underline">
            Oyni tozalash
          </button>
        )}
        <button
          onClick={() => setOverdueOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
            overdueOnly ? 'border-danger bg-danger text-white' : 'border-border bg-surface text-ink'
          }`}
        >
          <AlertTriangle size={15} />
          Kechikkan
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        {(view === 'active' ? loading : allOrders.length === 0 && loadingMore) ? (
          <Spinner className="p-8" />
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-dark">Buyurtmalar topilmadi</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-gray-dark">
                  <th className="px-5 py-3 font-semibold">№</th>
                  <th className="px-5 py-3 font-semibold">Mijoz</th>
                  <th className="px-5 py-3 font-semibold">Xizmat turi</th>
                  <th className="px-5 py-3 font-semibold">Tarif</th>
                  <th className="px-5 py-3 font-semibold">Holat</th>
                  <th className="px-5 py-3 font-semibold">Muddat</th>
                  <th className="px-5 py-3 text-right font-semibold">Summa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const items = itemsByOrder[o.id] ?? []
                  const overdue = isOrderOverdue(o, items)
                  const dueDate = effectiveDueDate(o, items)
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-bg"
                    >
                      <td className="px-5 py-3 font-bold text-ink">#{o.orderNumber}</td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-ink">{o.customerName || "Noma'lum"}</div>
                        <div className="text-xs text-gray-dark">{o.phone}</div>
                      </td>
                      <td className="px-5 py-3 text-ink">{o.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}</td>
                      <td className="px-5 py-3">
                        <TariffDots tariffs={distinctTariffs(o, items)} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={`px-5 py-3 font-semibold ${overdue ? 'text-danger' : 'text-ink'}`}>
                        {dueDate ? formatDateUz(dueDate) : '—'}
                        {overdue && ' · kechikmoqda'}
                      </td>
                      <td className="px-5 py-3 text-right font-extrabold text-brand-primary">{formatMoney(o.totalPrice)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {view === 'all' && (
          <div className="flex justify-center border-t border-border p-4">
            {hasMore ? (
              <button
                onClick={() => loadAllOrders(false)}
                disabled={loadingMore}
                className="rounded-xl border border-border px-5 py-2 text-sm font-bold text-ink hover:bg-bg disabled:opacity-50"
              >
                {loadingMore ? 'Yuklanmoqda...' : 'Yana yuklash'}
              </button>
            ) : (
              allOrders.length > 0 && <span className="text-xs text-gray-dark">Barchasi yuklandi</span>
            )}
          </div>
        )}
      </section>

      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onDeleted={(orderId) => setAllOrders((prev) => prev.filter((o) => o.id !== orderId))}
        />
      )}
    </div>
  )
}

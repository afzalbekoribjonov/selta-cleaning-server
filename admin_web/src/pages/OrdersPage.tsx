import { useMemo, useState } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { fetchOrdersPage, isOverdue, type Order, type QueryDocumentSnapshot } from '@/lib/orders'
import { STATUS_CONFIG, TARIFF_CONFIG } from '@/lib/status-config'
import { StatusBadge, TariffBadge } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDateUz } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function OrdersPage() {
  const [view, setView] = useState<'active' | 'all'>('active')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tariffFilter, setTariffFilter] = useState('')
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
    if (tariffFilter) list = list.filter((o) => o.tariff === tariffFilter)
    if (overdueOnly) list = list.filter(isOverdue)
    return list
  }, [baseOrders, search, statusFilter, tariffFilter, overdueOnly])

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
          value={tariffFilter}
          onChange={(e) => setTariffFilter(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
        >
          <option value="">Barcha tarif</option>
          {Object.entries(TARIFF_CONFIG).map(([key, t]) => (
            <option key={key} value={key}>
              {t.label}
            </option>
          ))}
        </select>
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
                  const overdue = isOverdue(o)
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
                        <TariffBadge tariff={o.tariff} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={`px-5 py-3 font-semibold ${overdue ? 'text-danger' : 'text-ink'}`}>
                        {o.dueDate ? formatDateUz(o.dueDate) : '—'}
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

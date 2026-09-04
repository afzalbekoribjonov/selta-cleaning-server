import { useMemo, useState } from 'react'
import { Search, AlertTriangle, X } from 'lucide-react'
import { useActiveOrders } from '@/hooks/useRecentOrders'
import { fetchOrdersPage, type Order, type QueryDocumentSnapshot } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import {
  ITEM_STATUS_OPTIONS,
  ORDER_STATUS_OPTIONS,
  matchedItemCount,
  orderMatchesStatus,
  parseStatusFilter,
  statusLabel,
} from '@/lib/order-status-filter'
import { StatusBadge, TariffDots } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDateUz } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'
import { OrderSummaryCard } from '@/components/orders/OrderSummaryCard'

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

  // "Faol" ko'rinish holat bo'yicha to'liq so'raladi — avval oxirgi 150 ta
  // buyurtmadan klientda filtrlanardi, shuning uchun eski faol buyurtmalar
  // ro'yxatdan tushib qolardi.
  const { orders: activeOrders, loading } = useActiveOrders()

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

  const baseOrders = useMemo(
    () => (view === 'active' ? (activeOrders ?? []) : allOrders),
    [view, activeOrders, allOrders],
  )

  const activeStatus = useMemo(() => (statusFilter ? parseStatusFilter(statusFilter) : null), [statusFilter])

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
    if (activeStatus) list = list.filter((o) => orderMatchesStatus(o, activeStatus))
    if (monthFilter) {
      list = list.filter((o) => {
        const ym = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}`
        return ym === monthFilter
      })
    }
    if (overdueOnly) list = list.filter((o) => isOrderOverdue(o))

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
  }, [baseOrders, search, activeStatus, monthFilter, overdueOnly, sortBy])

  /** Mahsulot holati bo'yicha filtrlanganda — mos kelgan mahsulotlar jami. */
  const matchedItemsTotal = useMemo(() => {
    if (!activeStatus || activeStatus.scope !== 'item') return null
    return filtered.reduce((sum, o) => sum + (matchedItemCount(o, activeStatus) ?? 0), 0)
  }, [filtered, activeStatus])

  const showLoader = view === 'active' ? loading : allOrders.length === 0 && loadingMore

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Buyurtmalar</h1>
          <p className="mt-1 text-sm text-gray-dark">
            {view === 'active' ? 'Faol buyurtmalar (yakunlanmagan)' : 'Barcha buyurtmalar tarixi'}
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1">
          {(
            [
              { key: 'active', label: 'Faol' },
              { key: 'all', label: 'Barchasi' },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              onClick={() => switchView(v.key)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                view === v.key ? 'bg-brand-primary text-white' : 'text-ink/70'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Telefonda filtrlar bir-biriga tiqilib, har biri o'z tabiiy
          kengligida turardi. Endi: qidiruv butun enni, qolgani ikki
          ustunli tarmoqni egallaydi; sm dan boshlab avvalgi qator. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative col-span-2 sm:min-w-[220px] sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki # bo'yicha qidirish"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
          />
        </div>

        {/* Ikki qamrov ataylab ajratilgan: olib kelish buyurtmasi butun
            umri "Sexga keldi"da turadi, haqiqiy jarayon esa mahsulot
            darajasida kechadi. */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary sm:w-auto"
        >
          <option value="">Barcha holat</option>
          <optgroup label="Mahsulot holati">
            {ITEM_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Buyurtma holati">
            {ORDER_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary sm:w-auto"
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
          className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary sm:w-auto"
        />

        <button
          onClick={() => setOverdueOnly((v) => !v)}
          className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors ${
            overdueOnly ? 'border-danger bg-danger text-white' : 'border-border bg-surface text-ink'
          }`}
        >
          <AlertTriangle size={15} />
          Kechikkan
        </button>
      </div>

      {/* Faol filtrlar — ro'yxat nima uchun shunday ekani ko'rinib tursin. */}
      {(activeStatus || monthFilter || overdueOnly) && (
        <div className="flex flex-wrap items-center gap-2">
          {activeStatus && (
            <FilterPill onClear={() => setStatusFilter('')}>
              {activeStatus.scope === 'item' ? 'Mahsulot holati' : 'Buyurtma holati'}:{' '}
              <strong>{statusLabel(activeStatus.status)}</strong>
              {matchedItemsTotal != null && <span className="ml-1 opacity-80">({matchedItemsTotal} ta mahsulot)</span>}
            </FilterPill>
          )}
          {monthFilter && <FilterPill onClear={() => setMonthFilter('')}>Oy: {monthFilter}</FilterPill>}
          {overdueOnly && <FilterPill onClear={() => setOverdueOnly(false)}>Faqat kechikkanlar</FilterPill>}
          <span className="text-xs font-semibold text-gray-dark">{filtered.length} ta buyurtma</span>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        {showLoader ? (
          <Spinner className="p-8" />
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-dark">Buyurtmalar topilmadi</p>
        ) : (
          <>
            {/* Telefon: kartalar. lg dan boshlab to'liq jadval. */}
            <div className="space-y-2 p-3 lg:hidden">
              {filtered.map((o) => (
                <OrderSummaryCard
                  key={o.id}
                  order={o}
                  matchedCount={matchedItemCount(o, activeStatus)}
                  matchedLabel={activeStatus ? statusLabel(activeStatus.status) : undefined}
                  onClick={() => setSelectedOrder(o)}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-gray-dark">
                    <th className="px-5 py-3 font-semibold">№</th>
                    <th className="px-5 py-3 font-semibold">Mijoz</th>
                    <th className="px-5 py-3 font-semibold">Xizmat turi</th>
                    <th className="px-5 py-3 font-semibold">Mahsulotlar</th>
                    <th className="px-5 py-3 font-semibold">Tarif</th>
                    <th className="px-5 py-3 font-semibold">Muddat</th>
                    <th className="px-5 py-3 text-right font-semibold">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const overdue = isOrderOverdue(o)
                    const dueDate = effectiveDueDate(o)
                    const matched = matchedItemCount(o, activeStatus)
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
                        <td className="px-5 py-3 text-ink">
                          {o.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}
                        </td>
                        <td className="px-5 py-3">
                          <ItemsCell
                            order={o}
                            matched={matched}
                            label={activeStatus ? statusLabel(activeStatus.status) : undefined}
                          />
                        </td>
                        <td className="px-5 py-3">
                          <TariffDots tariffs={distinctTariffs(o)} />
                        </td>
                        <td className={`px-5 py-3 font-semibold ${overdue ? 'text-danger' : 'text-ink'}`}>
                          {dueDate ? formatDateUz(dueDate) : '—'}
                          {overdue && ' · kechikmoqda'}
                        </td>
                        <td className="px-5 py-3 text-right font-extrabold text-brand-primary">
                          {formatMoney(o.totalPrice)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
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

function FilterPill({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-primary">
      {children}
      <button
        onClick={onClear}
        className="rounded-full p-0.5 hover:bg-brand-primary/20"
        aria-label="Filtrni olib tashlash"
      >
        <X size={12} />
      </button>
    </span>
  )
}

/**
 * "Mahsulotlar" ustuni — jami soni, va holat bo'yicha filtrlanganda shu
 * holatdagi mahsulotlar soni alohida. Busiz buyurtma nima uchun
 * ro'yxatga tushgani ko'rinmasdi: buyurtmaning o'z holati o'zgarmagan
 * bo'ladi.
 */
function ItemsCell({ order, matched, label }: { order: Order; matched: number | null; label?: string }) {
  if (order.serviceType === 'onsite') {
    return <StatusBadge status={order.status} />
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink">{order.itemCount ?? '—'} ta</span>
      {matched != null && matched > 0 && (
        <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-bold text-brand-primary">
          {matched} ta {label?.toLowerCase()}
        </span>
      )}
      {order.zeroPriceItemCount > 0 && (
        <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger">
          {order.zeroPriceItemCount} o'lchanmagan
        </span>
      )}
    </div>
  )
}

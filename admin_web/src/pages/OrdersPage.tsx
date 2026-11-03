import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Loader2, MessageSquare, Ruler, Search, X } from 'lucide-react'
import { useActiveOrders } from '@/hooks/useRecentOrders'
import { fetchOrdersPage, searchOrders, type Order, type QueryDocumentSnapshot } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import {
  ITEM_STATUS_OPTIONS,
  ORDER_STATUS_OPTIONS,
  matchedItemCount,
  orderMatchesStatus,
  parseStatusFilter,
  statusLabel,
} from '@/lib/order-status-filter'
import { businessMonthRange } from '@/lib/business-time'
import { UZ_MONTHS_FULL, formatDateUz } from '@/lib/date-utils'
import { formatMoney, formatQty, unitList } from '@/lib/units'
import { cn } from '@/lib/utils'
import { TariffDots } from '@/components/ui/StatusBadge'
import { Segmented } from '@/components/ui/Panel'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'
import { OrderSummaryCard } from '@/components/orders/OrderSummaryCard'
import { OrderProgress } from '@/components/orders/OrderProgress'

type SortKey = 'latest' | 'earliest' | 'due' | 'expensive' | 'cheap'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: 'Oxirgilar' },
  { key: 'earliest', label: 'Boshidagilar' },
  { key: 'due', label: 'Muddati yaqin' },
  { key: 'expensive', label: 'Eng qimmat' },
  { key: 'cheap', label: 'Eng arzon' },
]

type Service = '' | 'pickup' | 'onsite'

/** Joriy oydan orqaga 24 oy — `<input type=month>` o'rniga (Safari va Chrome'da bo'sh holati turlicha va tushunarsiz). */
function recentMonths(): string[] {
  const now = new Date()
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${UZ_MONTHS_FULL[m - 1] ?? ''} ${y}`
}

/**
 * Filtrlar URL'da saqlanadi (`?status=item:washing&overdue=1`): boshqaruv
 * panelidagi plitkalar shu yerga aynan kerakli ro'yxat bilan olib keladi,
 * sahifa yangilansa yoki havola ulashilsa filtr yo'qolmaydi.
 */
function useOrderFilters() {
  const [params, setParams] = useSearchParams()
  const sortParam = params.get('sort') as SortKey | null
  const filters = {
    view: (params.get('view') === 'all' ? 'all' : 'active') as 'active' | 'all',
    status: params.get('status') ?? '',
    service: (['pickup', 'onsite'].includes(params.get('service') ?? '') ? params.get('service') : '') as Service,
    month: /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : '',
    sort: SORT_OPTIONS.some((o) => o.key === sortParam) ? sortParam! : 'latest',
    overdue: params.get('overdue') === '1',
    unmeasured: params.get('unmeasured') === '1',
  }
  const update = useCallback(
    (patch: Record<string, string | boolean | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            const value = v === true ? '1' : v === false ? null : v
            if (value && !(k === 'view' && value === 'active') && !(k === 'sort' && value === 'latest')) next.set(k, value)
            else next.delete(k)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [filters, update] as const
}

export default function OrdersPage() {
  const [filters, update] = useOrderFilters()
  const { view, status: statusFilter, service, month: monthFilter, sort: sortBy, overdue: overdueOnly, unmeasured: unmeasuredOnly } = filters
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // "Faol" ko'rinish holat bo'yicha to'liq so'raladi (eski faol buyurtmalar
  // ham tushib qolmaydi).
  const { orders: activeOrders, loading } = useActiveOrders()

  // "Barchasi" — kursor bilan sahifalanadi. Oy tanlansa, shu oyning o'zi
  // serverdan so'raladi (avval faqat yuklangan sahifalar filtrlanardi va
  // eski oylar bo'sh chiqardi).
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const requestRef = useRef(0)

  const loadAllOrders = useCallback(
    async (reset: boolean, from: QueryDocumentSnapshot | null) => {
      const request = ++requestRef.current
      setLoadingMore(true)
      setLoadError(false)
      try {
        const range = monthFilter ? businessMonthRange(monthFilter) : undefined
        const page = await fetchOrdersPage(reset ? undefined : (from ?? undefined), range)
        if (request !== requestRef.current) return
        setAllOrders((prev) => (reset ? page.orders : [...prev, ...page.orders]))
        setCursor(page.lastDoc)
        setHasMore(page.hasMore)
      } catch {
        if (request === requestRef.current) setLoadError(true)
      } finally {
        if (request === requestRef.current) setLoadingMore(false)
      }
    },
    [monthFilter],
  )

  useEffect(() => {
    if (view !== 'all') return
    setAllOrders([])
    setCursor(null)
    setHasMore(true)
    void loadAllOrders(true, null)
  }, [view, loadAllOrders])

  const baseOrders = useMemo(() => (view === 'active' ? (activeOrders ?? []) : allOrders), [view, activeOrders, allOrders])
  const activeStatus = useMemo(() => (statusFilter ? parseStatusFilter(statusFilter) : null), [statusFilter])

  // Qidiruv to'g'ridan-to'g'ri Firestore'dan ham so'raladi — raqam bo'yicha
  // izlaganda buyurtma yakunlangan yoki yuklanmagan bo'lsa ham topiladi.
  const [remoteResults, setRemoteResults] = useState<Order[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const term = search.trim()
    if (!term) {
      setRemoteResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchOrders(term)
        .then((found) => !cancelled && setRemoteResults(found))
        .catch(() => !cancelled && setRemoteResults([]))
        .finally(() => !cancelled && setSearching(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  const filtered = useMemo(() => {
    let list = baseOrders
    const q = search.trim().toLowerCase()
    if (q) {
      const local = list.filter(
        (o) => o.customerName.toLowerCase().includes(q) || o.phone.toLowerCase().includes(q) || o.orderNumber.toString().includes(q),
      )
      // Serverdan kelganlari mahalliy matn filtridan o'tkazilmaydi: telefon
      // bazada boshqa formatda bo'lishi mumkin.
      const byId = new Map<string, Order>()
      for (const o of remoteResults) byId.set(o.id, o)
      for (const o of local) byId.set(o.id, o)
      list = [...byId.values()]
    }
    if (activeStatus) list = list.filter((o) => orderMatchesStatus(o, activeStatus))
    if (service) list = list.filter((o) => o.serviceType === service)
    if (monthFilter) {
      list = list.filter((o) => `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}` === monthFilter)
    }
    if (overdueOnly) list = list.filter((o) => isOrderOverdue(o))
    if (unmeasuredOnly) list = list.filter((o) => o.zeroPriceItemCount > 0 && o.status !== 'done')

    const dueMs = (o: Order) => effectiveDueDate(o)?.getTime() ?? Number.POSITIVE_INFINITY
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'earliest':
          return a.createdAt.getTime() - b.createdAt.getTime()
        case 'due':
          return dueMs(a) - dueMs(b)
        case 'expensive':
          return b.totalPrice - a.totalPrice
        case 'cheap':
          return a.totalPrice - b.totalPrice
        default:
          return b.createdAt.getTime() - a.createdAt.getTime()
      }
    })
  }, [baseOrders, search, remoteResults, activeStatus, service, monthFilter, overdueOnly, unmeasuredOnly, sortBy])

  /** Mahsulot holati bo'yicha filtrlanganda — mos kelgan mahsulotlar jami. */
  const matchedItemsTotal = useMemo(() => {
    if (!activeStatus || activeStatus.scope !== 'item') return null
    return filtered.reduce((sum, o) => sum + (matchedItemCount(o, activeStatus) ?? 0), 0)
  }, [filtered, activeStatus])

  const anyFilter = !!(activeStatus || service || monthFilter || overdueOnly || unmeasuredOnly)
  const showLoader = view === 'active' ? loading : allOrders.length === 0 && loadingMore
  const selectClass =
    'h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-brand-primary sm:w-auto'

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Buyurtmalar</h1>
          <p className="mt-0.5 text-sm text-gray-dark">
            {search.trim()
              ? 'Qidiruv — barcha buyurtmalar orasidan'
              : view === 'active'
                ? 'Faol (yakunlanmagan) buyurtmalar'
                : monthFilter
                  ? `${monthTitle(monthFilter)} — barcha buyurtmalar`
                  : 'Barcha buyurtmalar tarixi'}
          </p>
        </div>
        <Segmented
          value={view}
          onChange={(v) => update({ view: v })}
          options={[
            { value: 'active', label: 'Faol' },
            { value: 'all', label: 'Barchasi' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:min-w-[240px] sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" size={16} />
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Raqam, ism yoki telefon"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-9 text-base outline-none focus:border-brand-primary sm:text-sm"
          />
          {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand-primary" />}
        </div>

        {/* Ikki qamrov ataylab ajratilgan: olib kelish buyurtmasi butun umri
            "Sexga keldi"da turadi, haqiqiy jarayon mahsulot darajasida. */}
        <select value={statusFilter} onChange={(e) => update({ status: e.target.value || null })} className={selectClass} aria-label="Holat">
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

        <select value={service} onChange={(e) => update({ service: e.target.value || null })} className={selectClass} aria-label="Xizmat turi">
          <option value="">Barcha xizmat</option>
          <option value="pickup">Olib kelish</option>
          <option value="onsite">Joyida yuvish</option>
        </select>

        <select value={sortBy} onChange={(e) => update({ sort: e.target.value })} className={selectClass} aria-label="Saralash">
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>

        <select value={monthFilter} onChange={(e) => update({ month: e.target.value || null })} className={selectClass} aria-label="Oy">
          <option value="">Barcha oylar</option>
          {recentMonths().map((m) => (
            <option key={m} value={m}>
              {monthTitle(m)}
            </option>
          ))}
        </select>

        <div className="col-span-2 grid grid-cols-2 gap-2 sm:flex">
          <ToggleButton active={overdueOnly} tone="danger" onClick={() => update({ overdue: !overdueOnly })} icon={AlertTriangle}>
            Kechikkan
          </ToggleButton>
          <ToggleButton active={unmeasuredOnly} tone="warning" onClick={() => update({ unmeasured: !unmeasuredOnly })} icon={Ruler}>
            O'lchanmagan
          </ToggleButton>
        </div>
      </div>

      {/* Faol filtrlar — ro'yxat nima uchun shunday ekani ko'rinib tursin. */}
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {activeStatus && (
          <FilterPill onClear={() => update({ status: null })}>
            {activeStatus.scope === 'item' ? 'Mahsulot' : 'Buyurtma'}: <strong>{statusLabel(activeStatus.status)}</strong>
            {matchedItemsTotal != null && <span className="ml-1 opacity-80">({matchedItemsTotal} ta mahsulot)</span>}
          </FilterPill>
        )}
        {service && (
          <FilterPill onClear={() => update({ service: null })}>{service === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}</FilterPill>
        )}
        {monthFilter && <FilterPill onClear={() => update({ month: null })}>{monthTitle(monthFilter)}</FilterPill>}
        {overdueOnly && <FilterPill onClear={() => update({ overdue: false })}>Faqat kechikkanlar</FilterPill>}
        {unmeasuredOnly && <FilterPill onClear={() => update({ unmeasured: false })}>Faqat o'lchanmaganlar</FilterPill>}
        <span className="text-xs font-semibold text-gray-dark">
          {showLoader ? 'Yuklanmoqda…' : `${filtered.length} ta buyurtma`}
          {view === 'all' && hasMore && !showLoader && ' (yuklanganlari orasida)'}
        </span>
        {anyFilter && (
          <button
            onClick={() => update({ status: null, service: null, month: null, overdue: false, unmeasured: false })}
            className="text-xs font-bold text-brand-primary hover:underline"
          >
            Tozalash
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        {showLoader ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-bg" />
            ))}
          </div>
        ) : loadError && allOrders.length === 0 && view === 'all' ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-semibold text-danger">Buyurtmalarni yuklab bo'lmadi</p>
            <button onClick={() => loadAllOrders(true, null)} className="text-xs font-bold text-brand-primary hover:underline">
              Qayta urinish
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-dark">{searching ? 'Qidirilmoqda…' : 'Buyurtmalar topilmadi'}</p>
        ) : (
          <>
            {/* Telefon/planshet: kartalar. xl dan boshlab to'liq jadval. */}
            <div className="grid gap-2 p-3 md:grid-cols-2 xl:hidden">
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

            <div className="hidden xl:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[92px]" />
                  <col />
                  <col className="w-[22%]" />
                  <col className="w-[20%]" />
                  <col className="w-[120px]" />
                  <col className="w-[150px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-gray-dark">
                    <th className="px-4 py-3">№</th>
                    <th className="px-4 py-3">Mijoz</th>
                    <th className="px-4 py-3">Holat</th>
                    <th className="px-4 py-3">Mahsulotlar</th>
                    <th className="px-4 py-3">Muddat</th>
                    <th className="px-4 py-3 text-right">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      matched={matchedItemCount(o, activeStatus)}
                      matchedLabel={activeStatus ? statusLabel(activeStatus.status) : undefined}
                      onOpen={() => setSelectedOrder(o)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {view === 'all' && !showLoader && (allOrders.length > 0 || hasMore) && (
          <div className="flex justify-center border-t border-border p-4">
            {hasMore ? (
              <button
                onClick={() => loadAllOrders(false, cursor)}
                disabled={loadingMore}
                className="flex h-10 items-center gap-2 rounded-xl border border-border px-5 text-sm font-bold text-ink hover:bg-bg disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={14} className="animate-spin" />}
                {loadingMore ? 'Yuklanmoqda…' : 'Yana yuklash'}
              </button>
            ) : (
              <span className="text-xs text-gray-dark">Barchasi yuklandi ({allOrders.length} ta)</span>
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

function OrderRow({
  order: o,
  matched,
  matchedLabel,
  onOpen,
}: {
  order: Order
  matched: number | null
  matchedLabel?: string
  onOpen: () => void
}) {
  const overdue = isOrderOverdue(o)
  const due = effectiveDueDate(o)
  const units = unitList(o.itemUnitTotals)
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      tabIndex={0}
      className={cn(
        'cursor-pointer border-b border-border align-top outline-none last:border-0 hover:bg-bg focus-visible:bg-bg',
        overdue && 'bg-danger-bg/20',
      )}
    >
      <td className="px-4 py-3">
        <div className="font-heading font-extrabold text-ink">#{o.orderNumber}</div>
        <div className="text-[11px] text-gray-dark">{formatDateUz(o.createdAt)}</div>
      </td>
      <td className="px-4 py-3">
        <div className="font-semibold text-ink [overflow-wrap:anywhere]">{o.customerName || "Noma'lum"}</div>
        <div className="text-xs text-gray-dark">
          {o.phone} · {o.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}
        </div>
        {o.lastComment && (
          <div className="mt-1 flex items-start gap-1 text-xs text-gray-dark" title={o.lastComment.text}>
            <MessageSquare size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1 min-w-0 [overflow-wrap:anywhere]">{o.lastComment.text}</span>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <OrderProgress order={o} />
      </td>
      <td className="px-4 py-3">
        {o.serviceType === 'onsite' ? (
          <span className="text-gray-dark">—</span>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-ink">{o.itemCount ?? '—'} ta</span>
              <TariffDots tariffs={distinctTariffs(o)} />
            </div>
            {units.length > 0 && (
              <div className="text-xs tabular-nums text-gray-dark">{units.map((u) => `${formatQty(u.amount, u.unit)} ${u.label}`).join(' · ')}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {matched != null && matched > 0 && (
                <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-bold text-brand-primary">
                  {matched} ta {matchedLabel?.toLowerCase()}
                </span>
              )}
              {o.zeroPriceItemCount > 0 && o.status !== 'done' && (
                <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger">{o.zeroPriceItemCount} o'lchanmagan</span>
              )}
            </div>
          </div>
        )}
      </td>
      <td className={cn('px-4 py-3 font-semibold', overdue ? 'text-danger' : 'text-ink')}>
        {o.status === 'done' ? (
          <span className="text-gray-dark">{o.doneAt ? formatDateUz(o.doneAt) : '—'}</span>
        ) : due ? (
          <>
            {formatDateUz(due)}
            {overdue && <div className="text-[11px] font-bold">kechikmoqda</div>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="whitespace-nowrap font-heading font-extrabold tabular-nums text-brand-primary">{formatMoney(o.totalPrice)}</div>
        {o.debtTotal > 0 && <div className="whitespace-nowrap text-[11px] font-bold text-danger">Qarz {formatMoney(o.debtTotal)}</div>}
        {o.debtTotal === 0 && o.prepaidAmount > 0 && o.status !== 'done' && (
          <div className="whitespace-nowrap text-[11px] font-bold text-success">Oldindan {formatMoney(o.prepaidAmount)}</div>
        )}
      </td>
    </tr>
  )
}

function ToggleButton({
  active,
  tone,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  tone: 'danger' | 'warning'
  onClick: () => void
  icon: typeof AlertTriangle
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-bold transition-colors',
        active
          ? tone === 'danger'
            ? 'border-danger bg-danger text-white'
            : 'border-warning bg-warning text-white'
          : 'border-border bg-surface text-ink hover:bg-bg',
      )}
    >
      <Icon size={15} />
      {children}
    </button>
  )
}

function FilterPill({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-primary">
      {children}
      <button onClick={onClear} className="rounded-full p-0.5 hover:bg-brand-primary/20" aria-label="Filtrni olib tashlash">
        <X size={12} />
      </button>
    </span>
  )
}

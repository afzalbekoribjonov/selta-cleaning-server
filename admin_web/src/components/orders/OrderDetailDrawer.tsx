import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore'
import {
  AlertTriangle,
  ArrowRight,
  CircleDot,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Star,
  StickyNote,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { subscribeOrder, type Order } from '@/lib/orders'
import { actorName, mapOrderItem, useItemEvents, type ItemEvent, type OrderItem } from '@/lib/order-items'
import { effectiveDueDate, isOrderOverdue, dueLabel } from '@/lib/order-tariffs'
import { itemProgressLabel } from '@/lib/order-status-filter'
import { STATUS_CONFIG } from '@/lib/status-config'
import { formatDateTimeUz, formatDateUz } from '@/lib/date-utils'
import { formatQty, unitList } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useTariffs } from '@/hooks/useTariffs'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useOrderSources } from '@/hooks/useOrderSources'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Segmented, SectionBoundary } from '@/components/ui/Panel'
import { DeleteOrderDialog } from './DeleteOrderDialog'
import { PrepaymentsSection } from './PrepaymentsSection'
import { BonusSection } from './BonusSection'
import { OrderPaymentSummary } from './OrderPaymentSummary'
import { OrderItemCard } from './OrderItemCard'
import { ItemEventRow, ItemTimeline } from './ItemTimeline'

interface StatusEvent {
  id: string
  fromStatus: string | null
  toStatus: string
  changedBy: string
  changedAt: Date
  note?: string
}

interface Comment {
  id: string
  authorId: string
  authorName?: string
  text: string
  createdAt: Date
  editedAt: Date | null
}

// Modul darajasida (komponent ichida emas) — har renderda YANGI funksiya
// obyekti yaratilmasligi uchun: useSubcollection mapper'ni effekt
// bog'liqligiga qo'shadi va yangi funksiya obunani cheksiz qayta ochardi.
function mapStatusEvent(id: string, d: Record<string, unknown>): StatusEvent {
  return {
    id,
    fromStatus: (d.fromStatus as string | null) ?? null,
    toStatus: (d.toStatus as string) ?? '',
    changedBy: (d.changedBy as string) ?? '',
    changedAt: (d.changedAt as Timestamp | undefined)?.toDate() ?? new Date(),
    note: (d.note as string | undefined) ?? undefined,
  }
}

function mapComment(id: string, d: Record<string, unknown>): Comment {
  return {
    id,
    authorId: (d.authorId as string) ?? '',
    authorName: d.authorName as string | undefined,
    text: (d.text as string) ?? '',
    createdAt: (d.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
    editedAt: (d.editedAt as Timestamp | undefined)?.toDate?.() ?? null,
  }
}

function useSubcollection<T>(orderId: string, name: string, orderField: string, mapper: (id: string, data: Record<string, unknown>) => T) {
  const [state, setState] = useState<{ key: string; items: T[]; loading: boolean; error: boolean }>({
    key: '',
    items: [],
    loading: true,
    error: false,
  })
  const key = `${orderId}/${name}`
  useEffect(() => {
    const q = query(collection(db, 'orders', orderId, name), orderBy(orderField, 'asc'))
    return onSnapshot(
      q,
      (snap) => setState({ key, items: snap.docs.map((d) => mapper(d.id, d.data())), loading: false, error: false }),
      // Ruxsat yoki tarmoq xatosi — "yuklanmoqda" abadiy aylanib qolmasin.
      () => setState({ key, items: [], loading: false, error: true }),
    )
  }, [key, orderId, name, orderField, mapper])
  return state.key === key ? state : { items: [] as T[], loading: true, error: false }
}

/**
 * Ochilgan payt ro'yxatdan olingan obyekt bilan boshlanadi (miltillamasin),
 * so'ng buyurtmaning o'zini jonli kuzatadi — boshqa joydan (ilova, boshqa
 * admin) o'zgarsa darrov ko'rinadi. O'chirilsa (`null`) drawer yopiladi.
 */
function useLiveOrder(initialOrder: Order, onDeleted: (orderId: string) => void) {
  const [order, setOrder] = useState(initialOrder)
  const onDeletedRef = useRef(onDeleted)
  useEffect(() => {
    onDeletedRef.current = onDeleted
  })

  useEffect(() => {
    setOrder(initialOrder)
    return subscribeOrder(initialOrder.id, (live) => {
      if (live) setOrder(live)
      else onDeletedRef.current(initialOrder.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder.id])

  return order
}

/** Drawer ochiq turganda orqadagi sahifa aylanmasin (ayniqsa iPhone Safari). */
function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
}

type Tab = 'overview' | 'items' | 'history' | 'comments'

export function OrderDetailDrawer({
  order: initialOrder,
  onClose,
  onDeleted,
}: {
  order: Order
  onClose: () => void
  /** Buyurtma o'chirilgach chaqiriladi (chaqiruvchi sahifadagi ro'yxatdan ham olib tashlash uchun). */
  onDeleted?: (orderId: string) => void
}) {
  useEscapeClose(onClose)
  useBodyScrollLock()
  const employees = useEmployeesMap()
  const { tariffs } = useTariffs()
  const { sources: orderSources } = useOrderSources()
  const order = useLiveOrder(initialOrder, (orderId) => {
    onDeleted?.(orderId)
    onClose()
  })
  const [tab, setTab] = useState<Tab>('overview')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const items = useSubcollection<OrderItem>(order.id, 'items', 'itemNumber', mapOrderItem)
  const statusHistory = useSubcollection<StatusEvent>(order.id, 'statusHistory', 'changedAt', mapStatusEvent)
  const comments = useSubcollection<Comment>(order.id, 'comments', 'createdAt', mapComment)
  const itemEvents = useItemEvents(order.id)

  const eventsByItem = useMemo(() => {
    const map = new Map<string, ItemEvent[]>()
    for (const e of itemEvents.events) {
      const list = map.get(e.itemId) ?? []
      list.push(e)
      map.set(e.itemId, list)
    }
    return map
  }, [itemEvents.events])

  // O'chirilgan mahsulotlar — faqat tarixda qolgan.
  const deletedItems = useMemo(() => {
    const present = new Set(items.items.map((i) => i.id))
    return itemEvents.events.filter((e) => e.type === 'deleted' && !present.has(e.itemId))
  }, [items.items, itemEvents.events])

  const overdue = isOrderOverdue(order)
  const due = effectiveDueDate(order)
  const progress = itemProgressLabel(order)
  const sourceInfo = orderSources.find((s) => s.id === order.source)
  const itemCount = items.loading ? (order.itemCount ?? 0) : items.items.length

  function switchTab(next: Tab) {
    setTab(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        ref={scrollRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Buyurtma #${order.orderNumber}`}
        className="h-full w-full overflow-y-auto overscroll-contain bg-bg shadow-2xl sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
          <div className="flex items-start justify-between gap-2 px-4 pt-3.5 sm:px-6">
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-extrabold leading-tight text-ink">Buyurtma #{order.orderNumber}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={order.status} />
                {overdue && (
                  <span className="flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger">
                    <AlertTriangle size={11} />
                    Kechikmoqda
                  </span>
                )}
                {sourceInfo && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: sourceInfo.color }}>
                    {sourceInfo.name}
                  </span>
                )}
                {order.intakeMethod === 'walk_in' && (
                  <span className="rounded-full bg-brand-accent/25 px-2 py-0.5 text-[11px] font-bold text-ink">O'zi keldi</span>
                )}
              </div>
              {progress && <p className="mt-1 text-xs font-semibold text-gray-dark">{progress}</p>}
            </div>
            <div className="-mr-1 flex shrink-0 items-center">
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-dark hover:bg-danger-bg hover:text-danger"
                title="Buyurtmani o'chirish"
                aria-label="Buyurtmani o'chirish"
              >
                <Trash2 size={18} />
              </button>
              <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-bg" aria-label="Yopish">
                <X size={20} />
              </button>
            </div>
          </div>

          <nav className="mt-2 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-5" aria-label="Buyurtma bo'limlari">
            {(
              [
                { key: 'overview', label: 'Umumiy' },
                { key: 'items', label: `Mahsulotlar${itemCount ? ` (${itemCount})` : ''}` },
                { key: 'history', label: 'Tarix' },
                { key: 'comments', label: `Izohlar${comments.items.length ? ` (${comments.items.length})` : ''}` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                className={cn(
                  'relative shrink-0 whitespace-nowrap px-3 pb-2.5 pt-1.5 text-[13px] font-bold transition-colors',
                  tab === t.key
                    ? 'text-brand-primary after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-brand-primary'
                    : 'text-gray-dark hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="space-y-4 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6">
          <SectionBoundary>
            {tab === 'overview' && (
              <OverviewTab order={order} items={items.items} itemsLoading={items.loading} employees={employees} due={due} overdue={overdue} />
            )}

            {tab === 'items' && (
              <div className="space-y-3">
                {order.serviceType === 'pickup' && unitList(order.itemUnitTotals).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {unitList(order.itemUnitTotals).map((u) => (
                      <span key={u.unit} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-bold tabular-nums text-ink ring-1 ring-border">
                        {formatQty(u.amount, u.unit)} {u.label}
                      </span>
                    ))}
                  </div>
                )}
                {items.loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />
                    ))}
                  </div>
                ) : items.error ? (
                  <ErrorNote text="Mahsulotlarni yuklab bo'lmadi" />
                ) : items.items.length === 0 ? (
                  <EmptyNote text={order.serviceType === 'onsite' ? "Joyida yuvish — mahsulotlar alohida yozilmagan" : 'Hali mahsulot qo\'shilmagan'} />
                ) : (
                  <ul className="space-y-2.5">
                    {items.items.map((item) => (
                      <OrderItemCard
                        key={item.id}
                        item={item}
                        orderId={order.id}
                        orderNumber={order.orderNumber}
                        events={eventsByItem.get(item.id) ?? []}
                        employees={employees}
                        tariffs={tariffs}
                      />
                    ))}
                  </ul>
                )}

                {deletedItems.length > 0 && (
                  <section className="rounded-2xl border border-dashed border-danger/40 bg-surface p-3.5">
                    <h3 className="mb-3 text-sm font-extrabold text-ink">O'chirilgan mahsulotlar ({deletedItems.length})</h3>
                    <ItemTimeline
                      events={deletedItems.flatMap((d) => eventsByItem.get(d.itemId) ?? [d])}
                      employees={employees}
                      orderNumber={order.orderNumber}
                      showItem
                    />
                  </section>
                )}
              </div>
            )}

            {tab === 'history' && (
              <HistoryTab
                order={order}
                statusHistory={statusHistory}
                itemEvents={itemEvents}
                items={items.items}
                employees={employees}
              />
            )}

            {tab === 'comments' && (
              <section className="space-y-2">
                {comments.loading ? (
                  <div className="h-20 animate-pulse rounded-2xl bg-surface" />
                ) : comments.error ? (
                  <ErrorNote text="Izohlarni yuklab bo'lmadi" />
                ) : comments.items.length === 0 ? (
                  <EmptyNote text="Hali izoh yo'q" />
                ) : (
                  [...comments.items].reverse().map((c) => (
                    <article key={c.id} className="rounded-2xl border border-border bg-surface p-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="text-[13px] font-bold text-ink">{c.authorName ?? employees[c.authorId] ?? 'Xodim'}</span>
                        <span className="text-[11px] tabular-nums text-gray-dark">
                          {formatDateTimeUz(c.createdAt)}
                          {c.editedAt && ' · tahrirlangan'}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink [overflow-wrap:anywhere]">{c.text}</p>
                    </article>
                  ))
                )}
              </section>
            )}
          </SectionBoundary>
        </div>
      </div>

      {deleteOpen && (
        <DeleteOrderDialog
          order={order}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            onDeleted?.(order.id)
            onClose()
          }}
        />
      )}
    </div>
  )
}

function OverviewTab({
  order,
  items,
  itemsLoading,
  employees,
  due,
  overdue,
}: {
  order: Order
  items: OrderItem[]
  itemsLoading: boolean
  employees: Record<string, string>
  due: Date | null
  overdue: boolean
}) {
  const units = unitList(order.itemUnitTotals)
  const team = order.assignedTeam.map((id) => employees[id] ?? 'Xodim')

  return (
    <div className="space-y-4">
      <OrderPaymentSummary order={order} items={items} itemsLoading={itemsLoading} />

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <User size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{order.customerName || "Noma'lum mijoz"}</div>
            {order.phone && (
              <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`} className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                <Phone size={13} />
                {order.phone}
              </a>
            )}
          </div>
        </div>
        {order.location && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-bg px-3 py-2">
            <MapPin size={15} className="mt-0.5 shrink-0 text-gray" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink [overflow-wrap:anywhere]">{order.location}</p>
              {order.gpsCoords && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.gpsCoords)}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:underline"
                >
                  <Navigation size={12} />
                  Xaritada ochish
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-extrabold text-ink">Buyurtma</h3>
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
          <Fact label="Xizmat turi">{order.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}</Fact>
          <Fact label="Qabul qilindi">{formatDateTimeUz(order.createdAt)}</Fact>
          {order.createdBy && <Fact label="Qabul qildi">{actorName(employees, order.createdBy, null)}</Fact>}
          {order.intakeMethod === 'walk_in' ? (
            <Fact label="Qabul usuli">Mijoz o'zi olib keldi</Fact>
          ) : (
            order.pickedUpAt && (
              <Fact label="Olib keldi">
                {order.pickedUpByName ?? actorName(employees, order.pickedUpBy ?? '', 'delivery')}
                <span className="text-gray-dark"> · {formatDateTimeUz(order.pickedUpAt)}</span>
              </Fact>
            )
          )}
          {team.length > 0 && <Fact label="Jamoa">{team.join(', ')}</Fact>}
          {due && order.status !== 'done' && (
            <Fact label={order.serviceType === 'pickup' ? 'Eng yaqin muddat' : 'Muddat'}>
              <span className={overdue ? 'font-bold text-danger' : undefined}>
                {formatDateUz(due)} · {dueLabel(due)}
              </span>
            </Fact>
          )}
          {order.doneAt && <Fact label="Yakunlandi">{formatDateTimeUz(order.doneAt)}</Fact>}
          {units.length > 0 && (
            <Fact label="Hajm">{units.map((u) => `${formatQty(u.amount, u.unit)} ${u.label}`).join(' · ')}</Fact>
          )}
        </dl>
      </section>

      {order.notedItems.length > 0 && (
        <section className="rounded-2xl border border-brand-accent/40 bg-brand-accent/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <StickyNote size={16} className="text-ink" />
            <h3 className="text-sm font-extrabold text-ink">Sotuv menejeri qaydlari</h3>
          </div>
          <ol className="list-inside list-decimal space-y-0.5 text-sm font-semibold text-ink">
            {order.notedItems.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ol>
        </section>
      )}

      {order.lastComment && (
        <section className="flex gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
          <MessageSquare size={16} className="mt-0.5 shrink-0 text-brand-primary" />
          <div className="min-w-0">
            <p className="text-sm text-ink [overflow-wrap:anywhere]">{order.lastComment.text}</p>
            <p className="mt-0.5 text-[11px] text-gray-dark">
              Oxirgi izoh · {order.lastComment.authorName || 'Xodim'}
              {order.lastComment.at && ` · ${formatDateTimeUz(order.lastComment.at)}`}
            </p>
          </div>
        </section>
      )}

      <PrepaymentsSection order={order} />
      <BonusSection order={order} />

      {order.qcRating ? (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-extrabold text-ink">Sifat nazorati bahosi</h3>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={16} className={i < order.qcRating! ? 'fill-brand-accent text-brand-accent' : 'text-border'} />
            ))}
          </div>
          {order.qcRatingNote && <p className="mt-2 text-sm text-ink">{order.qcRatingNote}</p>}
        </section>
      ) : null}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-dark">{label}</dt>
      <dd className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">{children}</dd>
    </>
  )
}

type FeedEntry = { kind: 'order'; at: Date; event: StatusEvent } | { kind: 'item'; at: Date; event: ItemEvent }

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']

/**
 * Buyurtmaning to'liq tarixi — buyurtma holati va mahsulotlardagi barcha
 * o'zgarishlar bitta vaqt chizig'ida, eng yangisi tepada, kunlar
 * bo'yicha guruhlangan.
 */
function HistoryTab({
  order,
  statusHistory,
  itemEvents,
  items,
  employees,
}: {
  order: Order
  statusHistory: { items: StatusEvent[]; loading: boolean; error: boolean }
  itemEvents: { events: ItemEvent[]; loading: boolean; error: boolean }
  items: OrderItem[]
  employees: Record<string, string>
}) {
  const [filter, setFilter] = useState<'all' | 'order' | 'items'>('all')
  const hasItems = items.length > 0 || itemEvents.events.length > 0

  const groups = useMemo(() => {
    const feed: FeedEntry[] = []
    if (filter !== 'items') for (const e of statusHistory.items) feed.push({ kind: 'order', at: e.changedAt, event: e })
    if (filter !== 'order') for (const e of itemEvents.events) if (e.at) feed.push({ kind: 'item', at: e.at, event: e })
    feed.sort((a, b) => b.at.getTime() - a.at.getTime())
    const out: { day: string; label: string; entries: FeedEntry[] }[] = []
    for (const entry of feed) {
      const day = `${entry.at.getFullYear()}-${entry.at.getMonth()}-${entry.at.getDate()}`
      let group = out[out.length - 1]
      if (!group || group.day !== day) {
        group = { day, label: `${WEEKDAYS[entry.at.getDay()]}, ${formatDateUz(entry.at)}`, entries: [] }
        out.push(group)
      }
      group.entries.push(entry)
    }
    return out
  }, [filter, statusHistory.items, itemEvents.events])

  const loading = statusHistory.loading || itemEvents.loading
  const noItemHistory = !itemEvents.loading && itemEvents.events.length === 0 && items.length > 0

  return (
    <div className="space-y-3">
      {hasItems && (
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Hammasi' },
            { value: 'order', label: 'Buyurtma holati' },
            { value: 'items', label: 'Mahsulotlar' },
          ]}
        />
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-surface" />
      ) : statusHistory.error && itemEvents.error ? (
        <ErrorNote text="Tarixni yuklab bo'lmadi" />
      ) : groups.length === 0 ? (
        <EmptyNote text="Hali o'zgarish yo'q" />
      ) : (
        groups.map((g) => (
          <section key={g.day} className="rounded-2xl border border-border bg-surface p-3.5">
            <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-dark">{g.label}</h3>
            <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
              {g.entries.map((entry) =>
                entry.kind === 'item' ? (
                  <ItemEventRow key={entry.event.id} event={entry.event} employees={employees} orderNumber={order.orderNumber} showItem />
                ) : (
                  <OrderEventRow key={entry.event.id} event={entry.event} employees={employees} />
                ),
              )}
            </ol>
          </section>
        ))
      )}

      {noItemHistory && filter !== 'order' && (
        <p className="px-1 text-[11px] text-gray">
          Bu buyurtma mahsulotlari batafsil tarix yozilishidan oldin qo'shilgan — har bir mahsulotning asosiy bosqichlari
          "Mahsulotlar" bo'limida ko'rinadi.
        </p>
      )}
    </div>
  )
}

function OrderEventRow({ event: h, employees }: { event: StatusEvent; employees: Record<string, string> }) {
  const to = STATUS_CONFIG[h.toStatus]
  return (
    <li className="relative flex gap-3">
      <span
        className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-surface"
        style={{ backgroundColor: to?.bg ?? '#f1eff3', color: to?.color ?? '#7a7482' }}
      >
        <CircleDot size={14} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-bold leading-snug text-ink">
          <span className="text-gray-dark">Buyurtma:</span>
          {h.fromStatus && (
            <>
              <span className="font-semibold text-gray-dark">{STATUS_CONFIG[h.fromStatus]?.label ?? h.fromStatus}</span>
              <ArrowRight size={12} className="text-gray" />
            </>
          )}
          <span>{to?.label ?? h.toStatus}</span>
        </div>
        {h.note && <p className="mt-0.5 text-xs text-gray-dark">{h.note}</p>}
        <p className="mt-0.5 text-[11px] text-gray-dark">
          {actorName(employees, h.changedBy, null)} · {formatDateTimeUz(h.changedAt)}
        </p>
      </div>
    </li>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-gray-dark">{text}</p>
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-2xl bg-danger-bg/60 px-4 py-6 text-sm font-semibold text-danger">
      <AlertTriangle size={16} />
      {text}
    </p>
  )
}

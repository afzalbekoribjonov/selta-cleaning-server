import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore'
import { X, User, Phone, MapPin, Calendar, Clock, Star, Trash2, Navigation, StickyNote } from 'lucide-react'
import { db } from '@/lib/firebase'
import { isOverdue, subscribeOrder, type Order } from '@/lib/orders'
import { StatusBadge, TariffBadge } from '@/components/ui/StatusBadge'
import { STATUS_CONFIG, TARIFF_CONFIG, colorStageFor, COLOR_STAGE_HEX } from '@/lib/status-config'
import { formatDateTimeUz, formatDateUz } from '@/lib/date-utils'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { Spinner } from '@/components/ui/Spinner'
import { ORDER_SOURCE_CONFIG } from '@/lib/order-sources'
import { DeleteOrderDialog } from './DeleteOrderDialog'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

interface OrderItem {
  id: string
  itemNumber: number
  name: string
  area: number
  price: number
  qcStatus: string
  qcNote: string | null
  // Faqat pickup buyurtma itemlarida mavjud (talab: item-level pipeline).
  status: string | null
  tariff: string | null
  createdAt: Date | null
  deliveredByName: string | null
}

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
}

function useSubcollection<T>(orderId: string, name: string, orderField: string, mapper: (id: string, data: Record<string, unknown>) => T) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, 'orders', orderId, name), orderBy(orderField, 'asc'))
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => mapper(d.id, d.data())))
      setLoading(false)
    })
  }, [orderId, name, orderField, mapper])
  return { items, loading }
}

/**
 * Ochilgan payt list'dan olingan statik obyekt bilan boshlanadi (flash
 * bo'lmasligi uchun), so'ng buyurtmaning o'zini real-vaqtli kuzatib,
 * jonli ma'lumotga o'tadi — boshqa joydan (mobil ilova va h.k.)
 * o'zgartirilgan status/summa darrov ko'rinishi uchun. Buyurtma
 * o'chirilsa (`null`), drawer avtomatik yopiladi.
 */
function useLiveOrder(initialOrder: Order, onDeleted: (orderId: string) => void) {
  const [order, setOrder] = useState(initialOrder)
  const onDeletedRef = useRef(onDeleted)
  onDeletedRef.current = onDeleted

  useEffect(() => {
    setOrder(initialOrder)
    return subscribeOrder(initialOrder.id, (live) => {
      if (live) {
        setOrder(live)
      } else {
        onDeletedRef.current(initialOrder.id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder.id])

  return order
}

export function OrderDetailDrawer({
  order: initialOrder,
  onClose,
  onDeleted,
}: {
  order: Order
  onClose: () => void
  /** Buyurtma o'chirilgach chaqiriladi (masalan chaqiruvchi sahifadagi
   * statik ro'yxatdan ham olib tashlash uchun) — drawer avtomatik yopiladi. */
  onDeleted?: (orderId: string) => void
}) {
  useEscapeClose(onClose)
  const employees = useEmployeesMap()
  const order = useLiveOrder(initialOrder, (orderId) => {
    onDeleted?.(orderId)
    onClose()
  })
  const overdue = isOverdue(order)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { items, loading: itemsLoading } = useSubcollection<OrderItem>(order.id, 'items', 'itemNumber', (id, d) => ({
    id,
    itemNumber: (d.itemNumber as number) ?? 0,
    name: (d.name as string) ?? '',
    area: (d.area as number) ?? 0,
    price: (d.price as number) ?? 0,
    qcStatus: (d.qcStatus as string) ?? 'pending',
    qcNote: (d.qcNote as string | undefined) ?? null,
    status: (d.status as string | undefined) ?? null,
    tariff: (d.tariff as string | undefined) ?? null,
    createdAt: (d.createdAt as Timestamp | undefined)?.toDate() ?? null,
    deliveredByName: (d.deliveredByName as string | undefined) ?? null,
  }))

  const { items: history, loading: historyLoading } = useSubcollection<StatusEvent>(order.id, 'statusHistory', 'changedAt', (id, d) => ({
    id,
    fromStatus: (d.fromStatus as string | null) ?? null,
    toStatus: (d.toStatus as string) ?? '',
    changedBy: (d.changedBy as string) ?? '',
    changedAt: (d.changedAt as Timestamp | undefined)?.toDate() ?? new Date(),
    note: d.note as string | undefined,
  }))

  const { items: comments, loading: commentsLoading } = useSubcollection<Comment>(order.id, 'comments', 'createdAt', (id, d) => ({
    id,
    authorId: (d.authorId as string) ?? '',
    authorName: d.authorName as string | undefined,
    text: (d.text as string) ?? '',
    createdAt: (d.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
  }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div>
            <h2 className="text-lg font-heading font-extrabold text-ink">Buyurtma #{order.orderNumber}</h2>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge status={order.status} />
              <TariffBadge tariff={order.tariff} />
              {order.source && ORDER_SOURCE_CONFIG[order.source] && (
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: ORDER_SOURCE_CONFIG[order.source].color }}
                >
                  {ORDER_SOURCE_CONFIG[order.source].label}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDeleteOpen(true)}
              className="rounded-lg p-2 text-gray-dark hover:bg-danger-bg hover:text-danger"
              title="Buyurtmani o'chirish"
              aria-label="Buyurtmani o'chirish"
            >
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-bg" aria-label="Yopish">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="border-b border-border bg-brand-primary/5 px-6 py-4">
          <div className="text-xs font-semibold text-gray-dark">Umumiy summa</div>
          <div className="font-heading text-3xl font-extrabold text-brand-primary">{formatMoney(order.totalPrice)}</div>
        </div>

        <div className="space-y-5 p-6">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <InfoRow icon={User} text={order.customerName || "Noma'lum mijoz"} />
            <InfoRow icon={Phone} text={order.phone} />
            <InfoRow icon={MapPin} text={order.location} />
            {order.gpsCoords && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.gpsCoords)}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-[25px] mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
              >
                <Navigation size={12} />
                Xaritada ochish
              </a>
            )}
            {order.serviceType === 'onsite' && (
              <InfoRow
                icon={Calendar}
                text={order.dueDate ? `Muddat: ${formatDateUz(order.dueDate)}${overdue ? ' — kechikmoqda' : ''}` : 'Muddat belgilanmagan'}
                danger={overdue}
              />
            )}
            <InfoRow icon={Clock} text={`Qabul qilindi: ${formatDateTimeUz(order.createdAt)}`} />
            <InfoRow icon={User} text={`Xizmat turi: ${order.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}`} />
            {order.pickedUpByName && <InfoRow icon={Navigation} text={`Olib keldi: ${order.pickedUpByName}`} />}
          </section>

          {(order.notedItems.length > 0 || order.estimatedPrice != null) && (
            <section className="rounded-2xl border border-brand-accent/40 bg-brand-accent/10 p-4">
              <div className="mb-2 flex items-center gap-2">
                <StickyNote size={16} className="text-ink" />
                <h3 className="text-sm font-extrabold text-ink">Sotuv menejeri qaydlari</h3>
              </div>
              {order.notedItems.length > 0 && (
                <ol className="space-y-1">
                  {order.notedItems.map((name, i) => (
                    <li key={i} className="text-sm font-semibold text-ink">
                      {i + 1}. {name}
                    </li>
                  ))}
                </ol>
              )}
              {order.estimatedPrice != null && (
                <p className="mt-2 text-sm font-extrabold text-brand-primary">Taxminiy summa: {formatMoney(order.estimatedPrice)}</p>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-extrabold text-ink">Mahsulotlar ({items.length})</h3>
            {itemsLoading ? (
              <Spinner className="py-4" />
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-dark">Hali mahsulot belgilanmagan</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const done = item.status === 'done'
                  const showColorDot = !!item.status && !done && !!item.tariff && !!item.createdAt
                  const colorStage = showColorDot ? colorStageFor(item.tariff, item.createdAt!) : null
                  const statusInfo = item.status ? STATUS_CONFIG[item.status] : null
                  const tariffInfo = item.tariff ? TARIFF_CONFIG[item.tariff] : null
                  return (
                    <div key={item.id}>
                      <div className="flex items-center gap-2 text-sm">
                        {colorStage && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLOR_STAGE_HEX[colorStage] }} />}
                        <span className="shrink-0 rounded-md bg-brand-primary/10 px-2 py-0.5 text-xs font-bold text-brand-primary">
                          {order.orderNumber}/{item.itemNumber}
                        </span>
                        <span className={`flex-1 font-medium ${done ? 'text-success line-through' : 'text-ink'}`}>{item.name}</span>
                        {item.area > 0 && <span className="text-xs text-gray-dark">{item.area} m²</span>}
                        <span className="shrink-0 text-xs font-bold text-ink">{formatMoney(item.price)}</span>
                        {tariffInfo && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: tariffInfo.color, backgroundColor: tariffInfo.bg }}>
                            {tariffInfo.label}
                          </span>
                        )}
                        {statusInfo ? (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: statusInfo.color, backgroundColor: statusInfo.bg }}>
                            {statusInfo.label}
                          </span>
                        ) : (
                          <QcDot status={item.qcStatus} />
                        )}
                      </div>
                      {item.status === 'returned' && item.qcNote && (
                        <p className="ml-4 mt-0.5 text-xs font-semibold text-danger">Sabab: {item.qcNote}</p>
                      )}
                      {done && item.deliveredByName && (
                        <p className="ml-4 mt-0.5 text-xs font-semibold text-gray-dark">Yetkazdi: {item.deliveredByName}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {order.qcRating && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-extrabold text-ink">Sifat nazorati bahosi</h3>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={i < order.qcRating! ? 'fill-brand-accent text-brand-accent' : 'text-border'}
                  />
                ))}
              </div>
              {order.qcRatingNote && <p className="mt-2 text-sm text-ink">{order.qcRatingNote}</p>}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-extrabold text-ink">Tarix (kim, qachon o'zgartirgan)</h3>
            {historyLoading ? (
              <Spinner className="py-4" />
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-dark">Hali o'zgarish yo'q</p>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 text-sm">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                    <div className="flex-1">
                      <div className="text-ink">
                        {h.fromStatus ? (
                          <>
                            <span className="text-gray-dark">{STATUS_CONFIG[h.fromStatus]?.label ?? h.fromStatus}</span>
                            {' → '}
                          </>
                        ) : null}
                        <span className="font-bold">{STATUS_CONFIG[h.toStatus]?.label ?? h.toStatus}</span>
                      </div>
                      <div className="text-xs text-gray-dark">
                        {employees[h.changedBy] ?? h.changedBy} · {formatDateTimeUz(h.changedAt)}
                      </div>
                      {h.note && <div className="mt-0.5 text-xs italic text-gray-dark">{h.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-extrabold text-ink">Izohlar ({comments.length})</h3>
            {commentsLoading ? (
              <Spinner className="py-4" />
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-dark">Hali izoh yo'q</p>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl bg-bg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink">{c.authorName ?? employees[c.authorId] ?? 'Xodim'}</span>
                      <span className="text-xs text-gray-dark">{formatDateTimeUz(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
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

function InfoRow({ icon: Icon, text, danger }: { icon: typeof User; text: string; danger?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon size={15} className={danger ? 'text-danger' : 'text-gray'} />
      <span className={`text-sm ${danger ? 'font-bold text-danger' : 'text-ink'}`}>{text}</span>
    </div>
  )
}

function QcDot({ status }: { status: string }) {
  if (status === 'passed') return <span className="text-xs font-bold text-success">O'tdi</span>
  if (status === 'failed') return <span className="text-xs font-bold text-danger">O'tmadi</span>
  return <span className="text-xs text-gray">Kutilmoqda</span>
}

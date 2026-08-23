import { useState } from 'react'
import { X, Pencil, User, Phone, MapPin, Home, Truck, CalendarClock, Clock3, Users, StickyNote, Check } from 'lucide-react'
import { useOrder } from '@/hooks/useOrder'
import { useOrderItems } from '@/hooks/useOrderItems'
import { isOverdue } from '@/lib/orders'
import { subId } from '@/lib/order-items'
import { STATUS_CONFIG, SERVICE_PIPELINE } from '@/lib/status-config'
import { formatDateUz, formatDateTimeUz } from '@/lib/date-utils'
import { formatPhoneDisplay } from '@/lib/phone'
import { StatusBadge, TariffBadge } from '@/components/Badge'
import { ItemRow } from '@/components/ItemRow'
import { CommentsSection } from '@/components/CommentsSection'
import { EditOrderModal } from '@/components/EditOrderModal'
import { TeamAssignModal } from '@/components/TeamAssignModal'
import { Spinner } from '@/components/Spinner'

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export function OrderDetailDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useOrder(orderId)
  const { items } = useOrderItems(orderId)
  const [editOpen, setEditOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {order === undefined ? (
          <Spinner className="py-20" />
        ) : order === null ? (
          <div className="p-8 text-center text-sm text-gray-dark">Buyurtma topilmadi</div>
        ) : (
          <div className="p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-xl font-extrabold text-ink">Buyurtma #{order.orderNumber}</h2>
                  <button onClick={onClose} className="rounded-lg p-1.5 text-gray-dark hover:bg-surface lg:hidden">
                    <X size={18} />
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={order.status} />
                  {order.tariff && <TariffBadge tariff={order.tariff} />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditOpen(true)}
                  className="rounded-xl bg-surface p-2.5 text-brand-primary shadow-sm hover:bg-brand-primary/10"
                >
                  <Pencil size={17} />
                </button>
                <button onClick={onClose} className="hidden rounded-xl bg-surface p-2.5 text-gray-dark shadow-sm hover:bg-bg lg:block">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <InfoCard order={order} />

              {(order.notedItems.length > 0 || order.estimatedPrice != null) && (
                <div className="rounded-2xl border border-brand-accent/35 bg-brand-accent/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <StickyNote size={15} />
                    <span className="text-sm font-extrabold text-ink">Sotuv menejeri qaydlari</span>
                  </div>
                  {order.notedItems.map((n, i) => (
                    <p key={i} className="text-sm font-semibold text-ink">
                      {i + 1}. {n}
                    </p>
                  ))}
                  {order.estimatedPrice != null && (
                    <p className="mt-1.5 text-sm font-extrabold text-brand-primary">
                      Taxminiy summa: {formatMoney(order.estimatedPrice)}
                    </p>
                  )}
                </div>
              )}

              {order.serviceType === 'onsite' && order.status === 'new' && (
                <button
                  onClick={() => setTeamOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-primary py-3 text-sm font-extrabold text-brand-primary hover:bg-brand-primary/5"
                >
                  <Users size={17} />
                  Jamoa biriktirish
                </button>
              )}

              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-ink">Mahsulotlar</h3>
                  {items.length > 0 && <span className="text-sm font-extrabold text-brand-primary">{formatMoney(order.totalPrice)}</span>}
                </div>
                {items.length === 0 ? (
                  <p className="py-2 text-sm text-gray-dark">Hali mahsulot belgilanmagan</p>
                ) : (
                  <div className="divide-y divide-border">
                    {items.map((item) => (
                      <ItemRow key={item.id} item={item} subId={subId(item, order.orderNumber)} />
                    ))}
                  </div>
                )}
              </div>

              <ProgressCard order={order} />

              <CommentsSection orderId={order.id} />
            </div>
          </div>
        )}
      </div>

      {order && editOpen && <EditOrderModal order={order} onClose={() => setEditOpen(false)} />}
      {order && teamOpen && <TeamAssignModal orderId={order.id} onClose={() => setTeamOpen(false)} />}
    </div>
  )
}

function InfoCard({ order }: { order: NonNullable<ReturnType<typeof useOrder>> }) {
  const overdue = isOverdue(order)
  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-5">
      <Row icon={User} text={order.customerName || "Noma'lum mijoz"} />
      <Row icon={Phone} text={formatPhoneDisplay(order.phone)} />
      <Row icon={MapPin} text={order.location} />
      <Row
        icon={order.serviceType === 'onsite' ? Home : Truck}
        text={order.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}
      />
      {order.dueDate && (
        <Row icon={CalendarClock} text={`Muddat: ${formatDateUz(order.dueDate)}`} danger={overdue} />
      )}
      <Row icon={Clock3} text={`Qabul qilindi: ${formatDateTimeUz(order.createdAt)}`} />
    </div>
  )
}

function Row({ icon: Icon, text, danger }: { icon: typeof User; text: string; danger?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className={danger ? 'mt-0.5 text-danger' : 'mt-0.5 text-gray-dark'} />
      <span className={`text-sm ${danger ? 'font-bold text-danger' : 'font-medium text-ink'}`}>{text}</span>
    </div>
  )
}

function ProgressCard({ order }: { order: NonNullable<ReturnType<typeof useOrder>> }) {
  const pipeline = SERVICE_PIPELINE[order.serviceType] ?? SERVICE_PIPELINE.pickup
  const currentIndex = pipeline.indexOf(order.status)

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-extrabold text-ink">Jarayon</h3>
      {pipeline.map((status, i) => {
        const info = STATUS_CONFIG[status]
        const done = i < currentIndex
        const current = i === currentIndex
        const color = done || current ? info?.color ?? '#7A7482' : '#AAA5AF'
        const isLast = i === pipeline.length - 1
        return (
          <div key={status} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className="flex h-5.5 w-5.5 items-center justify-center rounded-full border-2"
                style={{ borderColor: color, background: done ? color : 'transparent', width: 22, height: 22 }}
              >
                {done && <Check size={13} color="white" />}
                {current && <div className="h-2 w-2 rounded-full" style={{ background: color }} />}
              </div>
              {!isLast && <div className="w-0.5 flex-1" style={{ background: done ? color : 'var(--color-border)', minHeight: 20 }} />}
            </div>
            <p
              className={`pb-4 text-sm ${current ? 'font-extrabold' : 'font-semibold'}`}
              style={{ color: done || current ? 'var(--color-ink)' : '#AAA5AF' }}
            >
              {info?.label ?? status}
            </p>
          </div>
        )
      })}
    </div>
  )
}

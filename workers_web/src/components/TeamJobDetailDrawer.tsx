import { useState } from 'react'
import { X, Plus, MapPin, CalendarClock, Clock3, StickyNote } from 'lucide-react'
import { useOrder } from '@/hooks/useOrder'
import { useOrderItems } from '@/hooks/useOrderItems'
import { subId, type OrderItem } from '@/lib/order-items'
import { changeOrderStatus } from '@/lib/orders-api'
import { formatDateUz } from '@/lib/date-utils'
import { StatusBadge } from '@/components/Badge'
import { ItemRow } from '@/components/ItemRow'
import { CommentsSection } from '@/components/CommentsSection'
import { CatalogItemModal } from '@/components/CatalogItemModal'
import { Spinner } from '@/components/Spinner'
import { useAuth } from '@/lib/auth-context'
import { describeApiError } from '@/lib/api'
import { isOverdue } from '@/lib/orders'

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

const NEXT_STAGE: Record<string, string> = { team_assigned: 'in_progress', in_progress: 'done' }
const ACTION_LABEL: Record<string, string> = { team_assigned: 'Ishni boshlash', in_progress: 'Yakunlash' }

export function TeamJobDetailDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useOrder(orderId)
  const { items } = useOrderItems(orderId)
  const { profile } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextStage = order ? NEXT_STAGE[order.status] : undefined
  const actionLabel = order ? ACTION_LABEL[order.status] : undefined
  const editable = order ? order.status !== 'done' : false

  async function advance() {
    if (!order || !nextStage) return
    setAdvancing(true)
    setError(null)
    try {
      await changeOrderStatus(order.id, nextStage, profile?.fullName)
      onClose()
    } catch (e) {
      setError(describeApiError(e))
      setAdvancing(false)
    }
  }

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
                <h2 className="font-heading text-xl font-extrabold text-ink">Joyida yuvish #{order.orderNumber}</h2>
                <p className="mt-1 text-sm font-semibold text-gray-dark">{order.customerName || "Noma'lum mijoz"}</p>
              </div>
              <button onClick={onClose} className="rounded-xl bg-surface p-2.5 text-gray-dark shadow-sm hover:bg-bg">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <StatusBadge status={order.status} />
            </div>

            <div className="mb-4 space-y-2 rounded-2xl border border-border bg-surface p-5">
              <Row icon={MapPin} text={order.location} />
              {order.dueDate && (
                <Row icon={CalendarClock} text={`Muddat: ${formatDateUz(order.dueDate)}`} danger={isOverdue(order)} />
              )}
              <Row icon={Clock3} text={`Qabul qilindi: ${formatDateUz(order.createdAt)}`} />
            </div>

            {(order.notedItems.length > 0 || order.estimatedPrice != null) && (
              <div className="mb-4 rounded-2xl border border-brand-accent/35 bg-brand-accent/10 p-4">
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

            <div className="mb-4 rounded-2xl border border-border bg-surface p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-ink">Mahsulotlar</h3>
                {editable && (
                  <button
                    onClick={() => setAddOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
                  >
                    <Plus size={14} />
                    {items.length === 0 ? "Qo'shish" : "Yana qo'shish"}
                  </button>
                )}
              </div>
              {items.length === 0 ? (
                <p className="py-2 text-sm text-gray-dark">Hali mahsulot qo'shilmagan</p>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      subId={subId(item, order.orderNumber)}
                      onClick={editable ? () => setEditingItem(item) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>

            {actionLabel && (
              <div className="mb-4">
                {error && <p className="mb-2 text-sm font-semibold text-danger">{error}</p>}
                <button
                  onClick={advance}
                  disabled={advancing}
                  className="w-full rounded-xl bg-brand-primary py-3.5 text-sm font-extrabold tracking-wide text-white shadow-sm disabled:opacity-60"
                >
                  {advancing ? '...' : actionLabel.toUpperCase()}
                </button>
              </div>
            )}

            <CommentsSection orderId={order.id} />
          </div>
        )}
      </div>

      {addOpen && order && (
        <CatalogItemModal serviceType={order.serviceType} orderTariff={order.tariff} orderId={order.id} onClose={() => setAddOpen(false)} />
      )}
      {editingItem && order && (
        <CatalogItemModal
          serviceType={order.serviceType}
          orderTariff={order.tariff}
          orderId={order.id}
          existingItem={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}

function Row({ icon: Icon, text, danger }: { icon: typeof MapPin; text: string; danger?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className={danger ? 'mt-0.5 text-danger' : 'mt-0.5 text-gray-dark'} />
      <span className={`text-sm ${danger ? 'font-bold text-danger' : 'font-medium text-ink'}`}>{text}</span>
    </div>
  )
}

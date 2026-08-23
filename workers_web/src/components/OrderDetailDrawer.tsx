import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useOrder } from '@/hooks/useOrder'
import { useOrderItems } from '@/hooks/useOrderItems'
import { CommentsSection } from '@/components/CommentsSection'
import { CatalogItemModal } from '@/components/CatalogItemModal'
import { WorkerItemRow } from '@/components/WorkerItemRow'
import { Spinner } from '@/components/Spinner'

export function OrderDetailDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useOrder(orderId)
  const { items } = useOrderItems(orderId)
  const [addOpen, setAddOpen] = useState(false)

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
                <h2 className="font-heading text-xl font-extrabold text-ink">Buyurtma #{order.orderNumber}</h2>
                <p className="mt-1 text-sm font-semibold text-gray-dark">{order.customerName || "Noma'lum mijoz"}</p>
              </div>
              <button onClick={onClose} className="rounded-xl bg-surface p-2.5 text-gray-dark shadow-sm hover:bg-bg">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-ink">Mahsulotlar</h3>
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
                >
                  <Plus size={14} />
                  {items.length === 0 ? 'Belgilash' : "Qo'shish"}
                </button>
              </div>
              {items.length === 0 ? (
                <p className="py-2 text-sm text-gray-dark">Hali mahsulot belgilanmagan</p>
              ) : (
                <div>
                  {items.map((item) => (
                    <WorkerItemRow key={item.id} order={order} item={item} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <CommentsSection orderId={order.id} />
            </div>
          </div>
        )}
      </div>

      {addOpen && order && (
        <CatalogItemModal serviceType={order.serviceType} orderId={order.id} onClose={() => setAddOpen(false)} />
      )}
    </div>
  )
}

import { Users, Timer } from 'lucide-react'
import { useMyTeamOrders } from '@/hooks/useMyTeamOrders'
import { formatDateUz } from '@/lib/date-utils'
import { isOverdue, type Order } from '@/lib/orders'
import { STATUS_CONFIG } from '@/lib/status-config'

export function TeamJobsBanner({ onOpen }: { onOpen: (orderId: string) => void }) {
  const orders = useMyTeamOrders()
  if (orders.length === 0) return null

  return (
    <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-primary to-brand-primary-dark p-5">
      <div className="mb-3 flex items-center gap-2">
        <Users size={17} className="text-white" />
        <span className="text-sm font-extrabold text-white">Joyida yuvish jamoasi — {orders.length} ta buyurtma</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {orders.map((o) => (
          <TeamJobCard key={o.id} order={o} onClick={() => onOpen(o.id)} />
        ))}
      </div>
    </div>
  )
}

function TeamJobCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const info = STATUS_CONFIG[order.status]
  const overdue = isOverdue(order)
  return (
    <button
      onClick={onClick}
      className="w-56 shrink-0 rounded-xl bg-white/10 p-3.5 text-left transition-colors hover:bg-white/15"
    >
      <p className="truncate text-sm font-extrabold text-white">
        #{order.orderNumber} — {order.customerName}
      </p>
      <span
        className="mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
        style={{ background: 'rgba(255,255,255,0.18)' }}
      >
        {info?.label ?? order.status}
      </span>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
        <span>Qabul: {formatDateUz(order.createdAt)}</span>
      </div>
      {order.dueDate && (
        <div className={`mt-1 flex items-center gap-1.5 text-[11px] font-bold ${overdue ? 'text-brand-accent' : 'text-white/70'}`}>
          <Timer size={11} />
          <span>Muddat: {formatDateUz(order.dueDate)}</span>
        </div>
      )}
    </button>
  )
}

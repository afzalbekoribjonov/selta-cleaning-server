import { useState } from 'react'
import { Home, MapPin, Phone, CalendarClock, ChevronRight, ShieldAlert } from 'lucide-react'
import { useMyTeamOrders } from '@/hooks/useMyTeamOrders'
import { useAuth } from '@/lib/auth-context'
import { isOverdue, type Order } from '@/lib/orders'
import { formatDateUz } from '@/lib/date-utils'
import { formatPhoneDisplay } from '@/lib/phone'
import { StatusBadge } from '@/components/Badge'
import { TeamJobDetailDrawer } from '@/components/TeamJobDetailDrawer'

/**
 * "Joyida yuvish" — shu xodimga biriktirilgan buyurtmalar. Biriktirishni
 * sotuv menejeri qiladi va u faqat `canDoOnsiteWashing` vakolati bor
 * xodimlarni tanlay oladi (server: assignTeam), shuning uchun bu yerda
 * vakolat yo'qligi alohida tushuntiriladi — aks holda bo'sh ekran
 * "nimadir buzilgan"dek tuyuladi.
 */
export default function TeamJobsPage() {
  const orders = useMyTeamOrders()
  const { profile } = useAuth()
  const [openId, setOpenId] = useState<string | null>(null)

  const permitted = profile?.canDoOnsiteWashing ?? false

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg">
          {permitted ? <Home size={28} className="text-gray" /> : <ShieldAlert size={28} className="text-gray" />}
        </div>
        {permitted ? (
          <>
            <p className="font-bold text-ink">Hozircha joyida yuvish ishi yo'q</p>
            <p className="text-sm text-gray-dark">
              Sotuv menejeri sizni jamoaga biriktirsa, buyurtma shu yerda paydo bo'ladi
            </p>
          </>
        ) : (
          <>
            <p className="font-bold text-ink">Joyida yuvish vakolati yo'q</p>
            <p className="text-sm text-gray-dark">
              Bu bo'limda ishlash uchun admin sizga alohida ruxsat berishi kerak
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-sm font-semibold text-gray-dark">{orders.length} ta buyurtma sizga biriktirilgan</p>
      <div className="space-y-3">
        {orders.map((order) => (
          <TeamJobCard key={order.id} order={order} onOpen={() => setOpenId(order.id)} />
        ))}
      </div>
      {openId && <TeamJobDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function TeamJobCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const overdue = isOverdue(order)
  return (
    <button
      onClick={onOpen}
      className={`w-full animate-fade-up rounded-2xl border bg-surface p-4 text-left active:scale-[0.99] ${
        overdue ? 'border-danger/40' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-brand-primary/10 px-2 py-1 text-xs font-extrabold text-brand-primary">
          #{order.orderNumber}
        </span>
        <StatusBadge status={order.status} />
        <ChevronRight size={17} className="ml-auto text-gray" />
      </div>

      <p className="mt-2.5 truncate text-[15px] font-extrabold text-ink">
        {order.customerName || "Noma'lum mijoz"}
      </p>

      <div className="mt-1.5 space-y-1">
        <Row icon={Phone} text={formatPhoneDisplay(order.phone)} />
        <Row icon={MapPin} text={order.location} />
        {order.dueDate && (
          <Row
            icon={CalendarClock}
            text={overdue ? `Muddati o'tgan — ${formatDateUz(order.dueDate)}` : formatDateUz(order.dueDate)}
            danger={overdue}
          />
        )}
      </div>
    </button>
  )
}

function Row({ icon: Icon, text, danger }: { icon: typeof Phone; text: string; danger?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className={`mt-0.5 shrink-0 ${danger ? 'text-danger' : 'text-gray'}`} />
      <span className={`truncate text-xs ${danger ? 'font-bold text-danger' : 'text-gray-dark'}`}>{text}</span>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Search, Hourglass, Droplets, Package, Undo2, CalendarClock, ChevronRight, X, Inbox } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useAuth } from '@/lib/auth-context'
import type { Order } from '@/lib/orders'
import { formatPhoneDisplay } from '@/lib/phone'
import { formatDateUz } from '@/lib/date-utils'
import { effectiveDueDate, isOrderOverdue, daysUntil, dueLabel } from '@/lib/order-tariffs'
import { OrderDetailDrawer } from '@/components/OrderDetailDrawer'
import { SeltaLoader } from '@/components/SeltaLoader'

const STAGES = [
  { key: 'pending', label: 'Kutilmoqda', icon: Hourglass },
  { key: 'washing', label: 'Yuvilmoqda', icon: Droplets },
  { key: 'packing', label: 'Upakovka', icon: Package },
  { key: 'returned', label: 'Qaytarilgan', icon: Undo2 },
] as const

type StageKey = (typeof STAGES)[number]['key']

export default function WorkerHomePage() {
  const { profile } = useAuth()
  const { orders, loading } = useRecentOrders()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<StageKey>('pending')
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  const canSeeWorkshopQueue = profile?.canSeeWorkshopQueue ?? true
  const specializations = profile?.specializations ?? []

  const activeOrders = useMemo(
    () => orders.filter((o) => o.serviceType === 'pickup' && o.status === 'brought_in'),
    [orders],
  )
  const ordersByStage = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result: Record<string, Order[]> = { pending: [], washing: [], packing: [], returned: [] }
    for (const s of STAGES.map((x) => x.key)) {
      // Mutaxassislik faqat yuvish bosqichlarida cheklaydi — upakovka va
      // qaytarilganlar hammaga ko'rinadi (server ham shunday tekshiradi).
      const restrictBySpecialization = s === 'pending' || s === 'washing'
      const seen = new Map<string, Order>()
      for (const order of activeOrders) {
        // Bosqichda mahsulot bormi va u mening mutaxassisligimga
        // mos keladimi — buyurtmadagi hosila maydonlardan. Avval buning
        // uchun har bir buyurtmaning mahsulotlari o'qilardi.
        const inStage = (order.itemStatusCounts[s] ?? 0) > 0
        if (!inStage) continue
        if (restrictBySpecialization && specializations.length > 0) {
          const cats = order.itemStageCategories[s] ?? []
          // '_none' — toifasi belgilanmagan mahsulot, u hammaga ko'rinadi
          // (server: assertWorkerLavozim bilan bir xil qoida).
          const matchesSpec = cats.some((c) => c === '_none' || specializations.includes(c))
          if (!matchesSpec) continue
        }
        if (q) {
          const matches =
            order.customerName.toLowerCase().includes(q) ||
            order.phone.toLowerCase().includes(q) ||
            order.orderNumber.toString().includes(q)
          if (!matches) continue
        }
        seen.set(order.id, order)
      }
      result[s] = Array.from(seen.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }
    return result
  }, [activeOrders, specializations, search])

  if (!canSeeWorkshopQueue) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg">
          <Inbox size={28} className="text-gray" />
        </div>
        <p className="font-bold text-ink">Sex navbati sizga yopilgan</p>
        <p className="text-sm text-gray-dark">
          Sizga joyida yuvish ishi biriktirilganda "Joyida yuvish" bo'limida ko'rinadi
        </p>
      </div>
    )
  }

  const list = ordersByStage[stage]

  return (
    <>
      <div className="px-4 pb-2 pt-1">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dark" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki #"
            className="h-12 w-full rounded-2xl border border-border bg-surface pl-11 pr-10 text-sm outline-none focus:border-brand-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-dark"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STAGES.map((s) => {
            const count = ordersByStage[s.key].length
            const active = stage === s.key
            return (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                  active ? 'bg-brand-primary text-white' : 'border border-border bg-surface text-ink/75'
                }`}
              >
                <s.icon size={14} />
                {s.label}
                <span
                  className={`min-w-[18px] rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
                    active ? 'bg-white/25 text-white' : 'bg-bg text-gray-dark'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 pt-2">
        {loading ? (
          <SeltaLoader label="Buyurtmalar yuklanmoqda..." className="py-20" />
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
              <Inbox size={24} className="text-gray" />
            </div>
            <p className="text-sm font-bold text-ink">Bu bosqichda buyurtma yo'q</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((order) => (
              <OrderCard key={order.id} order={order} onOpen={() => setOpenOrderId(order.id)} />
            ))}
          </div>
        )}
      </div>

      {openOrderId && <OrderDetailDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </>
  )
}

function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const due = effectiveDueDate(order)
  const overdue = isOrderOverdue(order)
  const remaining = due ? daysUntil(due) : null
  const zeroPriced = order.zeroPriceItemCount

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
        {zeroPriced > 0 && (
          <span className="rounded-lg bg-danger-bg px-2 py-1 text-[10px] font-extrabold text-danger">
            {zeroPriced} ta o'lchanmagan
          </span>
        )}
        <ChevronRight size={17} className="ml-auto text-gray" />
      </div>

      <p className="mt-2.5 truncate text-[15px] font-extrabold text-ink">{order.customerName || "Noma'lum mijoz"}</p>
      <p className="mt-0.5 truncate text-xs text-gray-dark">{formatPhoneDisplay(order.phone)}</p>

      {due && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <CalendarClock size={13} className={overdue ? 'text-danger' : 'text-gray'} />
          <span className={`text-[11px] font-semibold ${overdue ? 'text-danger' : 'text-gray-dark'}`}>
            {formatDateUz(due)}
          </span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
              overdue
                ? 'bg-danger-bg text-danger'
                : remaining !== null && remaining <= 1
                  ? 'bg-warning-bg text-warning'
                  : 'bg-success-bg text-success'
            }`}
          >
            {dueLabel(due)}
          </span>
        </div>
      )}
    </button>
  )
}

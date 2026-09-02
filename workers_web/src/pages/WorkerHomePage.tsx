import { useMemo, useState } from 'react'
import { Search, Hourglass, Droplets, Package, Undo2, CalendarClock } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useAllOrderItems, type StatsItem } from '@/hooks/useAllOrderItems'
import { useAuth } from '@/lib/auth-context'
import type { Order } from '@/lib/orders'
import { formatPhoneDisplay } from '@/lib/phone'
import { formatDateUz } from '@/lib/date-utils'
import { effectiveDueDate, isOrderOverdue, daysUntil, dueLabel } from '@/lib/order-tariffs'
import { TeamJobsBanner } from '@/components/TeamJobsBanner'
import { OrderDetailDrawer } from '@/components/OrderDetailDrawer'
import { TeamJobDetailDrawer } from '@/components/TeamJobDetailDrawer'
import { Spinner } from '@/components/Spinner'

const STAGES = [
  { key: 'pending', label: 'Kutilmoqda', icon: Hourglass },
  { key: 'washing', label: 'Yuvilmoqda', icon: Droplets },
  { key: 'packing', label: 'Upakovka', icon: Package },
  { key: 'returned', label: 'Qaytarilgan', icon: Undo2 },
] as const

export default function WorkerHomePage() {
  const { profile } = useAuth()
  const { orders, loading } = useRecentOrders()
  const [search, setSearch] = useState('')
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [openTeamOrderId, setOpenTeamOrderId] = useState<string | null>(null)

  const canSeeWorkshopQueue = profile?.canSeeWorkshopQueue ?? true
  const specializations = profile?.specializations ?? []

  const activeOrders = useMemo(
    () => orders.filter((o) => o.serviceType === 'pickup' && o.status === 'brought_in'),
    [orders],
  )
  const activeOrderIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders])
  const itemsByOrder = useAllOrderItems(activeOrderIds)

  const ordersByStage = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result: Record<string, Order[]> = { pending: [], washing: [], packing: [], returned: [] }
    for (const stage of STAGES.map((s) => s.key)) {
      const restrictBySpecialization = stage === 'pending' || stage === 'washing'
      const seen = new Map<string, Order>()
      for (const order of activeOrders) {
        const items = itemsByOrder[order.id] ?? []
        const hasMatch = items.some((item) => {
          if (item.status !== stage) return false
          if (restrictBySpecialization && specializations.length > 0) {
            return item.category == null || specializations.includes(item.category)
          }
          return true
        })
        if (!hasMatch) continue
        if (q) {
          const matchesSearch =
            order.customerName.toLowerCase().includes(q) ||
            order.phone.toLowerCase().includes(q) ||
            order.orderNumber.toString().includes(q)
          if (!matchesSearch) continue
        }
        seen.set(order.id, order)
      }
      result[stage] = Array.from(seen.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }
    return result
  }, [activeOrders, itemsByOrder, specializations, search])

  return (
    <div className="min-h-screen bg-bg">
      <TopBar />

      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <TeamJobsBanner onOpen={setOpenTeamOrderId} />

        {!canSeeWorkshopQueue ? (
          <div className="rounded-2xl border border-border bg-surface py-20 text-center">
            <p className="text-sm font-bold text-gray-dark">Sizga joyida yuvish ishi biriktirilganda shu yerda ko'rinadi</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="font-heading text-2xl font-extrabold text-ink">Ishlar</h1>
              <div className="relative w-80">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dark" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ism, telefon yoki # bo'yicha qidirish"
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            {loading ? (
              <Spinner className="py-16" />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                {STAGES.map((stage) => (
                  <StageColumn
                    key={stage.key}
                    label={stage.label}
                    icon={stage.icon}
                    orders={ordersByStage[stage.key]}
                    itemsByOrder={itemsByOrder}
                    onOpen={setOpenOrderId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {openOrderId && <OrderDetailDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
      {openTeamOrderId && <TeamJobDetailDrawer orderId={openTeamOrderId} onClose={() => setOpenTeamOrderId(null)} />}
    </div>
  )
}

function TopBar() {
  const { profile, logout } = useAuth()
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-8 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-sm font-extrabold text-white">
          S
        </div>
        <div>
          <p className="font-heading text-sm font-extrabold text-ink">Selta Cleaning</p>
          <p className="text-xs font-bold text-brand-primary">{profile?.fullName ?? '...'}</p>
        </div>
      </div>
      <button
        onClick={() => logout()}
        className="rounded-xl px-3.5 py-2 text-sm font-semibold text-gray-dark hover:bg-danger-bg hover:text-danger"
      >
        Chiqish
      </button>
    </header>
  )
}

function StageColumn({
  label,
  icon: Icon,
  orders,
  itemsByOrder,
  onOpen,
}: {
  label: string
  icon: typeof Hourglass
  orders: Order[]
  itemsByOrder: Record<string, StatsItem[]>
  onOpen: (id: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-brand-primary" />
        <h2 className="text-sm font-extrabold text-ink">{label}</h2>
        <span className="ml-auto rounded-full bg-bg px-2 py-0.5 text-xs font-bold text-gray-dark">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <p className="py-8 text-center text-xs text-gray-dark">Bu bosqichda buyurtma yo'q</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            // Talab: kartada eng yaqin topshirish sanasi va necha kun
            // qolgani ko'rinib tursin. Pickup buyurtmalarda muddat item
            // darajasida — order.dueDate null bo'ladi.
            const items = itemsByOrder[order.id] ?? []
            const due = effectiveDueDate(order, items)
            const overdue = isOrderOverdue(order, items)
            const remaining = due ? daysUntil(due) : null
            return (
              <button
                key={order.id}
                onClick={() => onOpen(order.id)}
                className="w-full rounded-xl border border-border bg-bg p-3 text-left transition-colors hover:border-brand-primary/40"
              >
                <p className="truncate text-sm font-extrabold text-brand-primary">#{order.orderNumber}</p>
                <p className="truncate text-sm font-bold text-ink">{order.customerName || "Noma'lum"}</p>
                <p className="mt-0.5 truncate text-xs text-gray-dark">{formatPhoneDisplay(order.phone)}</p>
                {due && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <CalendarClock size={12} className={overdue ? 'text-danger' : 'text-gray-dark'} />
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
          })}
        </div>
      )}
    </div>
  )
}

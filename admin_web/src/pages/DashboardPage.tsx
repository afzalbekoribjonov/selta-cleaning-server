import { useMemo, useState } from 'react'
import { ClipboardList, Clock, TrendingUp, AlertTriangle } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge, TariffBadge } from '@/components/ui/StatusBadge'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { isOverdue, type Order } from '@/lib/orders'
import { formatDateUz } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function isToday(date: Date): boolean {
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

export default function DashboardPage() {
  const { orders, loading } = useRecentOrders()
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const stats = useMemo(() => {
    const list = orders ?? []
    const active = list.filter((o) => o.status !== 'done')
    const today = list.filter((o) => isToday(o.createdAt))
    const todayRevenue = today.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    const overdue = active.filter(isOverdue)
    return { activeCount: active.length, todayCount: today.length, todayRevenue, overdueCount: overdue.length, active }
  }, [orders])

  const activeSorted = useMemo(() => {
    return [...stats.active].sort((a, b) => {
      const aOverdue = isOverdue(a)
      const bOverdue = isOverdue(b)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
  }, [stats.active])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Boshqaruv paneli</h1>
        <p className="text-sm text-gray-dark mt-1">Bugungi holat va faol buyurtmalar</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Faol buyurtmalar" value={loading ? '—' : String(stats.activeCount)} tone="primary" />
        <StatCard icon={Clock} label="Bugungi buyurtmalar" value={loading ? '—' : String(stats.todayCount)} tone="primary" />
        <StatCard icon={TrendingUp} label="Bugungi tushum" value={loading ? '—' : formatMoney(stats.todayRevenue)} tone="success" />
        <StatCard icon={AlertTriangle} label="Kechikkan buyurtmalar" value={loading ? '—' : String(stats.overdueCount)} tone="danger" />
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-ink">Faol buyurtmalar</h2>
          <span className="text-xs text-gray-dark">{stats.activeCount} ta</span>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-dark">Yuklanmoqda...</p>
        ) : activeSorted.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-dark">Hozircha faol buyurtma yo'q</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-dark border-b border-border">
                  <th className="px-5 py-3 font-semibold">№</th>
                  <th className="px-5 py-3 font-semibold">Mijoz</th>
                  <th className="px-5 py-3 font-semibold">Holat</th>
                  <th className="px-5 py-3 font-semibold">Tarif</th>
                  <th className="px-5 py-3 font-semibold">Muddat</th>
                </tr>
              </thead>
              <tbody>
                {activeSorted.slice(0, 20).map((o) => {
                  const overdue = isOverdue(o)
                  return (
                    <tr key={o.id} onClick={() => setSelectedOrder(o)} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 font-semibold text-ink">#{o.orderNumber}</td>
                      <td className="px-5 py-3 text-ink">{o.customerName || "Noma'lum"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-5 py-3">
                        <TariffBadge tariff={o.tariff} />
                      </td>
                      <td className={`px-5 py-3 font-semibold ${overdue ? 'text-danger' : 'text-ink'}`}>
                        {o.dueDate ? formatDateUz(o.dueDate) : '—'}
                        {overdue && ' · kechikmoqda'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedOrder && <OrderDetailDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}

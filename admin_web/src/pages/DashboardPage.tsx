import { useMemo, useState } from 'react'
import { ClipboardList, Clock, TrendingUp, AlertTriangle, Truck, PackageCheck } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge, TariffDots } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { useRecentOrders, useActiveOrders } from '@/hooks/useRecentOrders'
import { useAllOrderItems } from '@/hooks/useAllOrderItems'
import { type Order } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import { formatDateUz } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart'
import { ProfitLossCard } from '@/components/dashboard/ProfitLossCard'
import { EmployeeActivityChart } from '@/components/dashboard/EmployeeActivityChart'
import { MonthlyExpensesCard } from '@/components/dashboard/MonthlyExpensesCard'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function isToday(date: Date): boolean {
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

export default function DashboardPage() {
  // Ikki manba: `recentOrders` — oxirgi 150 ta (YAKUNLANGANLARI bilan),
  // bugungi ko'rsatkichlar shundan chiqadi; `activeOrders` — barcha faol
  // buyurtmalar (holat bo'yicha, to'liq). Avval ikkalasi ham bitta
  // cheklangan oynadan olinardi, shuning uchun eski faol buyurtmalar
  // "Faol buyurtmalar" ro'yxatidan tushib qolardi.
  const { orders, loading } = useRecentOrders()
  const { orders: activeOrders } = useActiveOrders()
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Talab: pickup buyurtmalarda tarif/muddat item-darajasida — "Kechikkan
  // buyurtmalar" hisoblagichi va jadvaldagi Muddat ustuni to'g'ri
  // ishlashi uchun itemlarni ham kuzatish kerak.
  const pickupOrderIds = useMemo(() => {
    const byId = new Map<string, Order>()
    for (const o of activeOrders ?? []) byId.set(o.id, o)
    for (const o of orders ?? []) byId.set(o.id, o)
    return [...byId.values()].filter((o) => o.serviceType === 'pickup').map((o) => o.id)
  }, [orders, activeOrders])
  const itemsByOrder = useAllOrderItems(pickupOrderIds)

  const stats = useMemo(() => {
    const list = orders ?? []
    const active = activeOrders ?? []
    const today = list.filter((o) => isToday(o.createdAt))
    const todayRevenue = today.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    const overdue = active.filter((o) => isOrderOverdue(o, itemsByOrder[o.id] ?? []))

    // Talab: dastavchiklar bugun jami nechta buyurtma olib kelgani va
    // nechta mahsulot yetkazganini ko'rsatish — barcha dastavchiklar
    // bo'yicha yig'indi (talab: "Bugun olindi"/"Bugun yetgazildi").
    const pickedUpToday = list.filter((o) => o.pickedUpAt && isToday(o.pickedUpAt)).length
    let deliveredToday = 0
    for (const o of list) {
      for (const item of itemsByOrder[o.id] ?? []) {
        if (item.deliveredAt && isToday(item.deliveredAt)) deliveredToday++
      }
    }

    return { activeCount: active.length, todayCount: today.length, todayRevenue, overdueCount: overdue.length, active, pickedUpToday, deliveredToday }
  }, [orders, activeOrders, itemsByOrder])

  const activeSorted = useMemo(() => {
    return [...stats.active].sort((a, b) => {
      const aOverdue = isOrderOverdue(a, itemsByOrder[a.id] ?? [])
      const bOverdue = isOrderOverdue(b, itemsByOrder[b.id] ?? [])
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
  }, [stats.active, itemsByOrder])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Boshqaruv paneli</h1>
        <p className="text-sm text-gray-dark mt-1">Bugungi holat va faol buyurtmalar</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <>
            <StatCard icon={ClipboardList} label="Faol buyurtmalar" value="—" tone="primary" />
            <StatCard icon={Clock} label="Bugungi buyurtmalar" value="—" tone="primary" />
            <StatCard icon={TrendingUp} label="Bugungi tushum" value="—" tone="success" />
            <StatCard icon={AlertTriangle} label="Kechikkan buyurtmalar" value="—" tone="danger" />
            <StatCard icon={Truck} label="Bugun olindi" value="—" tone="primary" />
            <StatCard icon={PackageCheck} label="Bugun yetgazildi" value="—" tone="success" />
          </>
        ) : (
          <>
            <StatCard icon={ClipboardList} label="Faol buyurtmalar" numericValue={stats.activeCount} tone="primary" />
            <StatCard icon={Clock} label="Bugungi buyurtmalar" numericValue={stats.todayCount} tone="primary" />
            <StatCard icon={TrendingUp} label="Bugungi tushum" numericValue={stats.todayRevenue} format={formatMoney} tone="success" />
            <StatCard icon={AlertTriangle} label="Kechikkan buyurtmalar" numericValue={stats.overdueCount} tone="danger" />
            <StatCard icon={Truck} label="Bugun olindi" numericValue={stats.pickedUpToday} tone="primary" />
            <StatCard icon={PackageCheck} label="Bugun yetgazildi" numericValue={stats.deliveredToday} tone="success" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RevenueTrendChart />
        <EmployeeActivityChart />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MonthlyExpensesCard />
        <ProfitLossCard />
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-ink">Faol buyurtmalar</h2>
          <span className="text-xs text-gray-dark">{stats.activeCount} ta</span>
        </div>
        {loading ? (
          <Spinner className="p-8" />
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
                  const items = itemsByOrder[o.id] ?? []
                  const overdue = isOrderOverdue(o, items)
                  const dueDate = effectiveDueDate(o, items)
                  return (
                    <tr key={o.id} onClick={() => setSelectedOrder(o)} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 font-semibold text-ink">#{o.orderNumber}</td>
                      <td className="px-5 py-3 text-ink">{o.customerName || "Noma'lum"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-5 py-3">
                        <TariffDots tariffs={distinctTariffs(o, items)} />
                      </td>
                      <td className={`px-5 py-3 font-semibold ${overdue ? 'text-danger' : 'text-ink'}`}>
                        {dueDate ? formatDateUz(dueDate) : '—'}
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

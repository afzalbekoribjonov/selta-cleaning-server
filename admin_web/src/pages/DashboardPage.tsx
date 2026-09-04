import { useEffect, useMemo, useState } from 'react'
import { apiPost } from '@/lib/api'
import { ClipboardList, Clock, TrendingUp, AlertTriangle } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge, TariffDots } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/Spinner'
import { useRecentOrders, useActiveOrders } from '@/hooks/useRecentOrders'
import { type Order } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import { formatDateUz } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'
import { OrderSummaryCard } from '@/components/orders/OrderSummaryCard'
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart'
import { ProfitLossCard } from '@/components/dashboard/ProfitLossCard'
import { EmployeeActivityChart } from '@/components/dashboard/EmployeeActivityChart'
import { MonthlyExpensesCard } from '@/components/dashboard/MonthlyExpensesCard'
import { DailyReportSection } from '@/components/dashboard/DailyReportSection'

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

  // Bir martalik, xavfsiz (idempotent) migratsiya — mahsulotlardan hosila
  // qilingan maydonlar (tarif/muddat/bosqich sonlari/hajm) qo'shilishidan
  // OLDINGI buyurtmalarni to'ldiradi. Busiz eski buyurtmalarda ro'yxatlar
  // tarif/muddatni ko'rsata olmaydi, chunki ular endi mahsulotlarni
  // o'qimaydi. (Kunlik jurnal migratsiyasi — DailyReportSection ichida,
  // ma'lumotga muhtoj bo'lgan joyning o'zida.)
  useEffect(() => {
    apiPost('/adminBackfillOrderSummary', {}).catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const list = orders ?? []
    const active = activeOrders ?? []
    const today = list.filter((o) => isToday(o.createdAt))
    const todayRevenue = today.reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    const overdue = active.filter((o) => isOrderOverdue(o))

    return { activeCount: active.length, todayCount: today.length, todayRevenue, overdueCount: overdue.length, active }
  }, [orders, activeOrders])

  const activeSorted = useMemo(() => {
    return [...stats.active].sort((a, b) => {
      const aOverdue = isOrderOverdue(a)
      const bOverdue = isOrderOverdue(b)
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

      <DailyReportSection />

      {/* "Bugun olindi/yetgazildi" kartalari olib tashlandi — ular endi
          "Kunlik ko'rsatkichlar" bo'limida, batafsil ro'yxati bilan. Ikki
          joyda ikki xil manbadan hisoblanishi raqamlarning bir-biriga mos
          kelmasligiga olib kelardi. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <StatCard icon={ClipboardList} label="Faol buyurtmalar" value="—" tone="primary" />
            <StatCard icon={Clock} label="Bugungi buyurtmalar" value="—" tone="primary" />
            <StatCard icon={TrendingUp} label="Bugungi tushum" value="—" tone="success" />
            <StatCard icon={AlertTriangle} label="Kechikkan buyurtmalar" value="—" tone="danger" />
          </>
        ) : (
          <>
            <StatCard icon={ClipboardList} label="Faol buyurtmalar" numericValue={stats.activeCount} tone="primary" />
            <StatCard icon={Clock} label="Bugungi buyurtmalar" numericValue={stats.todayCount} tone="primary" />
            <StatCard icon={TrendingUp} label="Bugungi tushum" numericValue={stats.todayRevenue} format={formatMoney} tone="success" />
            <StatCard icon={AlertTriangle} label="Kechikkan buyurtmalar" numericValue={stats.overdueCount} tone="danger" />
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
          <>
            {/* Telefon: kartalar; lg dan boshlab jadval (OrdersPage bilan bir xil naqsh). */}
            <div className="space-y-2 p-3 lg:hidden">
              {activeSorted.slice(0, 20).map((o) => (
                <OrderSummaryCard key={o.id} order={o} onClick={() => setSelectedOrder(o)} />
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
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
                  const overdue = isOrderOverdue(o)
                  const dueDate = effectiveDueDate(o)
                  return (
                    <tr key={o.id} onClick={() => setSelectedOrder(o)} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 font-semibold text-ink">#{o.orderNumber}</td>
                      <td className="px-5 py-3 text-ink">{o.customerName || "Noma'lum"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-5 py-3">
                        <TariffDots tariffs={distinctTariffs(o)} />
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
          </>
        )}
      </section>

      {selectedOrder && <OrderDetailDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}

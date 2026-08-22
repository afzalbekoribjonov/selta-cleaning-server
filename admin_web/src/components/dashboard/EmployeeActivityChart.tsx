import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { useAllOrderItems } from '@/hooks/useAllOrderItems'
import { computeEmployeeActivity, startOfToday, type ActivityRow } from '@/lib/employee-activity'
import { Spinner } from '@/components/ui/Spinner'

type DeptKey = 'delivery' | 'worker' | 'dispatcher'

const TABS: { key: DeptKey; label: string }[] = [
  { key: 'delivery', label: 'Dastavchik' },
  { key: 'worker', label: 'Ishchi' },
  { key: 'dispatcher', label: 'Sotuv menejeri' },
]

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

/** Har bir tabga tegishli birlamchi ko'rsatkich — saralash uchun. */
function primaryMetric(dept: DeptKey, r: ActivityRow): number {
  if (dept === 'delivery') return r.pickedUpCount + r.deliveredCount
  if (dept === 'worker') return r.washedCount + r.qcCount
  return r.ordersCreated
}

function hasActivity(dept: DeptKey, r: ActivityRow): boolean {
  return primaryMetric(dept, r) > 0
}

/**
 * "Eng faol xodimlar" — Dashboard'da faqat BUGUNGI faollik (talab:
 * "Kunlik qismi Boshqaruv panelida chiqib tursin"), ism-familiya bilan,
 * bo'lim bo'yicha tab. Haftalik/oylik va filtrlanadigan to'liq ko'rinish
 * "Maosh va statistika" sahifasida (EmployeeActivitySection).
 */
export function EmployeeActivityChart() {
  const [tab, setTab] = useState<DeptKey>('delivery')
  const { orders, loading: ordersLoading } = useRecentOrders()
  const employees = useEmployeesMap()

  const pickupOrderIds = useMemo(() => (orders ?? []).filter((o) => o.serviceType === 'pickup').map((o) => o.id), [orders])
  const itemsByOrder = useAllOrderItems(pickupOrderIds)

  const rows = useMemo(() => {
    const start = startOfToday()
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const activity = computeEmployeeActivity(orders ?? [], itemsByOrder, employees, start, end)
    return Object.values(activity)
      .filter((r) => hasActivity(tab, r))
      .sort((a, b) => primaryMetric(tab, b) - primaryMetric(tab, a))
      .slice(0, 8)
  }, [orders, itemsByOrder, employees, tab])

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Eng faol xodimlar — bugun</h2>
        </div>
        <div className="flex rounded-xl border border-border bg-bg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                tab === t.key ? 'bg-brand-primary text-white' : 'text-ink/70 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-dark">Bugungi kun bo'yicha, real-vaqtli</p>

      {ordersLoading ? (
        <Spinner className="py-12" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-dark">Bugun hali faollik yo'q</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.employeeId} className="rounded-xl bg-bg p-3.5">
              <div className="font-bold text-ink">{r.name}</div>
              {tab === 'delivery' && (
                <div className="mt-1 space-y-0.5 text-xs text-gray-dark">
                  <div>
                    Sexga olib keldi: <span className="font-bold text-ink">{r.pickedUpCount} ta buyurtma</span> ({formatMoney(r.pickedUpTotal)})
                  </div>
                  <div>
                    Yetgazdi: <span className="font-bold text-ink">{r.deliveredCount} ta mahsulot</span> ({formatMoney(r.deliveredTotal)})
                  </div>
                </div>
              )}
              {tab === 'worker' && (
                <div className="mt-1 space-y-0.5 text-xs text-gray-dark">
                  <div>
                    Yuvgan: <span className="font-bold text-ink">{r.washedCount} ta mahsulot</span>
                  </div>
                  <div>
                    Ishlov bergan (upakovka): <span className="font-bold text-ink">{r.qcCount} ta mahsulot</span>
                  </div>
                </div>
              )}
              {tab === 'dispatcher' && (
                <div className="mt-1 text-xs text-gray-dark">
                  <span className="font-bold text-ink">{r.ordersCreated} ta buyurtma</span> ({formatMoney(r.ordersCreatedTotal)})
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Link to="/payroll" className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-brand-primary hover:underline">
        Haftalik/oylik statistikani ko'rish
        <ArrowRight size={13} />
      </Link>
    </section>
  )
}

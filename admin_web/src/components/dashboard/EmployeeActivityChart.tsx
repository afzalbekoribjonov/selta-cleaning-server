import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { Spinner } from '@/components/ui/Spinner'
import type { Order } from '@/lib/orders'

type DeptKey = 'createdBy' | 'washedBy' | 'deliveredBy'

const TABS: { key: DeptKey; label: string }[] = [
  { key: 'createdBy', label: 'Sotuv menejeri' },
  { key: 'washedBy', label: 'Ishchi' },
  { key: 'deliveredBy', label: 'Dastavchik' },
]

interface Row {
  name: string
  count: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg">
      <div className="text-xs font-bold text-ink">{row.name}</div>
      <div className="mt-0.5 text-sm font-extrabold text-brand-primary">{row.count} ta buyurtma</div>
    </div>
  )
}

/**
 * So'nggi (bounded) buyurtmalar oynasi bo'yicha bo'lim tabi orqali
 * almashtiriladigan eng faol xodimlar diagrammasi — talab: "belgilashlar
 * orqali statistikalarni ko'ra oladigan" zamonaviy ko'rinish.
 */
export function EmployeeActivityChart() {
  const [tab, setTab] = useState<DeptKey>('createdBy')
  const { orders, loading } = useRecentOrders()
  const employees = useEmployeesMap()

  const rows = useMemo<Row[]>(() => {
    const list: Order[] = orders ?? []
    const tally: Record<string, number> = {}
    for (const o of list) {
      const id = o[tab]
      if (!id) continue
      tally[id] = (tally[id] ?? 0) + 1
    }
    return Object.entries(tally)
      .map(([id, count]) => ({ name: employees[id] ?? "Noma'lum xodim", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [orders, tab, employees])

  const chartHeight = Math.max(rows.length * 42, 120)

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Eng faol xodimlar</h2>
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
      <p className="mb-4 text-xs text-gray-dark">So'nggi buyurtmalar bo'yicha (real-vaqtli oyna)</p>

      {loading ? (
        <Spinner className="py-16" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-dark">Ma'lumot yo'q</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              width={110}
              tick={{ fill: 'var(--color-ink)', fontSize: 12, fontWeight: 600 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg)' }} />
            <Bar dataKey="count" fill="var(--color-brand-primary)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}

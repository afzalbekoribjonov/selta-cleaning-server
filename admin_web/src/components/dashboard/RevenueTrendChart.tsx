import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { useMonthlyRevenue, type MonthlyRevenue } from '@/hooks/useMonthlyRevenue'
import { UZ_MONTHS_SHORT } from '@/lib/date-utils'
import { Spinner } from '@/components/ui/Spinner'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyRevenue }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg">
      <div className="text-xs font-bold text-ink">
        {row.label} {row.projected && <span className="text-gray-dark">(taxminiy)</span>}
      </div>
      <div className="mt-0.5 text-sm font-extrabold text-brand-primary">{formatMoney(row.revenue)}</div>
      {!row.projected && <div className="text-[11px] text-gray-dark">{row.orderCount} ta buyurtma</div>}
    </div>
  )
}

/**
 * Oxirgi 6 oy + keyingi oy uchun taxminiy tushum (oxirgi 3 oy o'rtachasi) —
 * taxminiy ustun aniq boshqacha ko'rinishda (shaffof + kesik chegara +
 * "(taxminiy)" yorlig'i), rang bilan emas, matn bilan ajratiladi.
 */
export function RevenueTrendChart() {
  const { data, loading, error } = useMonthlyRevenue(6)

  const chartData: MonthlyRevenue[] = data
    ? (() => {
        const last3 = data.slice(-3)
        const avg = last3.reduce((s, m) => s + m.revenue, 0) / (last3.length || 1)
        const now = new Date()
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        const nextLabel = UZ_MONTHS_SHORT[next.getMonth()]
        return [...data, { month: 'projected', label: nextLabel, revenue: Math.round(avg), orderCount: 0, projected: true }]
      })()
    : []

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <TrendingUp size={18} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Oylik tushum tendensiyasi</h2>
      </div>
      <p className="mb-4 text-xs text-gray-dark">Oxirgi 6 oy haqiqiy tushum, oxirgi ustun — keyingi oy uchun taxmin</p>

      {loading && <Spinner className="py-16" />}
      {error && (
        <div className="py-8 text-center text-sm text-danger">
          <p className="font-semibold">Ma'lumotni yuklab bo'lmadi</p>
          <p className="mt-1 text-xs text-gray-dark">{error.message}</p>
        </div>
      )}
      {!loading && !error && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-gray-dark)', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }}
              tickFormatter={formatCompact}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg)' }} />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive>
              {chartData.map((entry) => (
                <Cell
                  key={entry.month}
                  fill="var(--color-brand-primary)"
                  fillOpacity={entry.projected ? 0.35 : 1}
                  stroke={entry.projected ? 'var(--color-brand-primary)' : 'none'}
                  strokeDasharray={entry.projected ? '4 3' : undefined}
                  strokeWidth={entry.projected ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {!loading && !error && (
        <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-dark">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-primary" />
            Haqiqiy tushum
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-brand-primary bg-brand-primary/30" />
            Keyingi oy (taxminiy)
          </span>
        </div>
      )}
    </section>
  )
}

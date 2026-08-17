import { useMemo } from 'react'
import { RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'
import { Receipt, Repeat } from 'lucide-react'
import { useExpenses } from '@/hooks/useExpenses'
import { computeMonthlyExpenses } from '@/lib/expenses'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Spinner } from '@/components/ui/Spinner'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

// Ketma-ket, bitta rangdan (brand-primary) och->to'q soya — miqdor bo'yicha
// tartiblangan kategoriyalar uchun (dataviz: "sequential = one hue").
const RING_SHADES = ['#5a148c', '#7b43a3', '#9c72ba', '#bda1d1', '#dcc8e5']

/**
 * Boshqaruv panelida "amaldagi oy chiqimlari" — halqali (radial) diagramma,
 * eng katta 4 ta chiqim turi + qolganlari "Boshqa" sifatida, animatsion
 * o'sish bilan. Dashboarddagi boshqa grafiklardan (vertikal/gorizontal bar,
 * area) farqli yangi shakl.
 */
export function MonthlyExpensesCard() {
  const { expenses, loading } = useExpenses()

  const { items, total, hasRecurring } = useMemo(() => {
    if (!expenses) return { items: [] as { name: string; amount: number; recurring: boolean }[], total: 0, hasRecurring: false }
    const now = new Date()
    const { items: monthItems, total: monthTotal } = computeMonthlyExpenses(expenses, now.getFullYear(), now.getMonth())

    const tally: Record<string, { amount: number; recurring: boolean }> = {}
    for (const e of monthItems) {
      const existing = tally[e.name]
      tally[e.name] = { amount: (existing?.amount ?? 0) + e.amount, recurring: existing?.recurring || e.recurring }
    }
    const sorted = Object.entries(tally)
      .map(([name, v]) => ({ name, amount: v.amount, recurring: v.recurring }))
      .sort((a, b) => b.amount - a.amount)

    const top = sorted.slice(0, 4)
    const rest = sorted.slice(4)
    const restTotal = rest.reduce((s, r) => s + r.amount, 0)
    const combined = restTotal > 0 ? [...top, { name: 'Boshqa', amount: restTotal, recurring: false }] : top

    return { items: combined, total: monthTotal, hasRecurring: monthItems.some((e) => e.recurring) }
  }, [expenses])

  const maxAmount = items.length > 0 ? items[0].amount : 0
  const radialData = items.map((it, i) => ({ ...it, fill: RING_SHADES[i] ?? RING_SHADES[RING_SHADES.length - 1] }))
  const ringSize = Math.max(items.length * 34, 140)

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Bu oy chiqimlari</h2>
        </div>
        {!loading && (
          <span className="rounded-full bg-danger-bg px-2.5 py-1 text-xs font-bold text-danger">
            <AnimatedNumber value={total} format={formatMoney} />
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-dark">
        Maoshdan tashqari xarajatlar — turlari bo'yicha{hasRecurring && ', takrorlanuvchilar hisobga olingan'}
      </p>

      {loading ? (
        <Spinner className="py-16" />
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-dark">Bu oy hali chiqim kiritilmagan</p>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <ResponsiveContainer width={ringSize} height={ringSize}>
              <RadialBarChart
                width={ringSize}
                height={ringSize}
                innerRadius="22%"
                outerRadius="100%"
                data={radialData}
                startAngle={90}
                endAngle={-270}
                barCategoryGap={6}
              >
                <RadialBar background={{ fill: 'var(--color-bg)' }} dataKey="amount" cornerRadius={6} max={maxAmount} isAnimationActive />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold text-gray-dark">Jami</span>
              <span className="text-sm font-extrabold text-ink">{formatCompact(total)}</span>
            </div>
          </div>

          <div className="w-full flex-1 space-y-2.5">
            {radialData.map((it) => (
              <div key={it.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: it.fill }} />
                  <span className="truncate font-semibold text-ink">{it.name}</span>
                  {it.recurring && <Repeat size={11} className="shrink-0 text-brand-primary" />}
                </span>
                <span className="shrink-0 font-bold text-gray-dark">{formatMoney(it.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

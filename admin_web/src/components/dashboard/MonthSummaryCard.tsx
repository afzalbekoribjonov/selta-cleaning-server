import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Wallet } from 'lucide-react'
import { businessDateKey } from '@/lib/business-time'
import { useDailyTrend } from '@/lib/daily-trend'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { computeMonthlyExpenses } from '@/lib/expenses'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useExpenses } from '@/hooks/useExpenses'
import { Panel } from '@/components/ui/Panel'

/**
 * "Bu oy" — oy boshidan kassaga HAQIQATAN tushgan pul (yetkazish, yopilgan
 * qarz, oldindan to'lov), shu oyning chiqimlari va ularning farqi.
 *
 * Avval panelda "oylik tushum" deb buyurtmalar NARXINING yig'indisi
 * ko'rsatilardi (hali olinmagan pul ham) — bu yerdagi raqam esa olingan pul.
 * Maosh bu yerda yo'q: u "Maosh va statistika" bo'limida hisoblanadi.
 */
export function MonthSummaryCard({ className }: { className?: string }) {
  const todayKey = businessDateKey(new Date())
  const monthKey = todayKey.slice(0, 7)
  const monthName = UZ_MONTHS_FULL[Number(monthKey.slice(5, 7)) - 1] ?? ''
  const trend = useDailyTrend(todayKey, 31)
  const { expenses, loading: expensesLoading } = useExpenses()

  const income = useMemo(() => {
    const days = (trend.data ?? []).filter((d) => d.date.startsWith(monthKey))
    return {
      amount: days.reduce((s, d) => s + d.collected.amount, 0),
      cash: days.reduce((s, d) => s + d.collected.cash, 0),
      card: days.reduce((s, d) => s + d.collected.card, 0),
    }
  }, [trend.data, monthKey])

  const spend = useMemo(() => {
    if (!expenses) return { total: 0, top: [] as { name: string; amount: number }[] }
    const [y, m] = monthKey.split('-').map(Number)
    const { items, total } = computeMonthlyExpenses(expenses, y, m - 1)
    const tally = new Map<string, number>()
    for (const e of items) tally.set(e.name, (tally.get(e.name) ?? 0) + e.amount)
    const top = [...tally.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    const head = top.slice(0, 4)
    const rest = top.slice(4).reduce((s, e) => s + e.amount, 0)
    return { total, top: rest > 0 ? [...head, { name: 'Boshqa', amount: rest }] : head }
  }, [expenses, monthKey])

  const loading = trend.isLoading || expensesLoading
  const net = income.amount - spend.total
  const maxSpend = spend.top[0]?.amount ?? 0

  return (
    <Panel className={className} icon={Wallet} title="Bu oy" subtitle={`${monthName} — kassaga tushgan va chiqimlar`}>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-bg" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2">
            <Row label="Kassaga tushdi" value={formatMoney(income.amount)} hint={`Naqd ${formatMoney(income.cash)} · Karta ${formatMoney(income.card)}`} />
            <Row label="Chiqimlar" value={`− ${formatMoney(spend.total)}`} hint="Maoshdan tashqari, doimiylar bilan" />
            <Row
              label="Farq"
              value={formatMoney(net)}
              hint="Maosh hisobga olinmagan"
              tone={net >= 0 ? 'success' : 'danger'}
              strong
            />
          </div>

          {spend.top.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold text-ink">Chiqim turlari</span>
                <Link to="/expenses" className="flex items-center gap-0.5 text-[11px] font-bold text-brand-primary hover:underline">
                  Barchasi <ArrowRight size={12} />
                </Link>
              </div>
              <ul className="space-y-1.5">
                {spend.top.map((e) => (
                  <li key={e.name}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-gray-dark">{e.name}</span>
                      <span className="shrink-0 font-bold tabular-nums text-ink">{formatMoney(e.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full bg-brand-secondary"
                        style={{ width: `${maxSpend > 0 ? Math.max(4, (e.amount / maxSpend) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

function Row({
  label,
  value,
  hint,
  tone,
  strong,
}: {
  label: string
  value: string
  hint: string
  tone?: 'success' | 'danger'
  strong?: boolean
}) {
  return (
    <div className={cn('min-w-0 rounded-xl px-3 py-2', strong ? 'bg-brand-primary/5' : 'bg-bg')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-gray-dark">{label}</span>
        <span
          className={cn(
            'truncate font-heading font-extrabold tabular-nums',
            strong ? 'text-lg' : 'text-[15px]',
            tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink',
          )}
          title={value}
        >
          {value}
        </span>
      </div>
      <div className="truncate text-[11px] text-gray-dark" title={hint}>
        {hint}
      </div>
    </div>
  )
}

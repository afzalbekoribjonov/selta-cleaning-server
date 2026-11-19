import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { UZ_MONTHS_SHORT } from '@/lib/date-utils'
import { formatMoney, formatMoneyShort } from '@/lib/units'
import { cn } from '@/lib/utils'
import { UZ_WEEKDAYS, addDays, daysInRange, lastDayOfMonth, monthLabel, todayKey, weekdayIndex, type DateRange } from '@/lib/uz-dates'

const WEEKDAYS_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

const axisMoney = (v: number) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))

function ChartTooltip({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg">
      <div className="text-xs font-bold text-ink">{title}</div>
      <div className="mt-0.5 text-sm font-extrabold text-danger">{formatMoney(value)}</div>
    </div>
  )
}

/** Oxirgi 12 oy — qaysi oyda qancha chiqim. Bosilsa — shu oy tanlanadi. */
export function MonthsChart({
  months,
  totals,
  activeMonths,
  onPick,
}: {
  months: string[]
  totals: Record<string, number> | undefined
  activeMonths: Set<string>
  onPick: (yearMonth: string) => void
}) {
  const data = months.map((ym) => ({ ym, label: UZ_MONTHS_SHORT[Number(ym.slice(5)) - 1], total: totals?.[ym] ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} interval={0} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} width={38} tickFormatter={axisMoney} />
        <Tooltip
          cursor={{ fill: 'var(--color-bg)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as (typeof data)[number]
            return <ChartTooltip title={monthLabel(row.ym)} value={row.total} />
          }}
        />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={36} onClick={(d) => onPick((d as unknown as { ym: string }).ym)} className="cursor-pointer">
          {data.map((d) => (
            <Cell key={d.ym} fill={activeMonths.has(d.ym) ? 'var(--color-danger)' : 'color-mix(in srgb, var(--color-danger) 28%, transparent)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Davr kunlari bo'yicha ustunlar. Bosilsa — o'sha kun ro'yxatda ochiladi. */
export function DailyChart({
  range,
  totals,
  selected,
  onSelect,
}: {
  range: DateRange
  totals: Map<string, number>
  selected: string | null
  onSelect: (dayKey: string) => void
}) {
  const data = useMemo(() => {
    const today = todayKey()
    const multiMonth = range.from.slice(0, 7) !== range.to.slice(0, 7)
    return Array.from({ length: daysInRange(range) }, (_, i) => {
      const key = addDays(range.from, i)
      const d = Number(key.slice(8))
      return { key, label: multiMonth ? `${d}.${key.slice(5, 7)}` : String(d), total: totals.get(key) ?? 0, future: key > today }
    }).filter((d) => !d.future)
  }, [range, totals])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} minTickGap={6} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} width={38} tickFormatter={axisMoney} />
        <Tooltip
          cursor={{ fill: 'var(--color-bg)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as (typeof data)[number]
            const d = Number(row.key.slice(8))
            return <ChartTooltip title={`${d}-${monthLabel(row.key.slice(0, 7)).split(' ')[0].toLowerCase()}, ${UZ_WEEKDAYS[weekdayIndex(row.key)].toLowerCase()}`} value={row.total} />
          }}
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28} onClick={(d) => onSelect((d as unknown as { key: string }).key)} className="cursor-pointer">
          {data.map((d) => (
            <Cell
              key={d.key}
              fill={!selected || selected === d.key ? 'var(--color-danger)' : 'color-mix(in srgb, var(--color-danger) 28%, transparent)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * O'zbekcha oy kalendari: har bir kunda chiqim summasi, rang to'qligi —
 * summaga qarab. Davr bir necha oyni qamrasa — har biri alohida.
 */
export function ExpenseCalendar({
  range,
  totals,
  selected,
  onSelect,
}: {
  range: DateRange
  totals: Map<string, number>
  selected: string | null
  onSelect: (dayKey: string) => void
}) {
  const today = todayKey()
  const months = useMemo(() => {
    const out: string[] = []
    let ym = range.from.slice(0, 7)
    while (ym <= range.to.slice(0, 7)) {
      out.push(ym)
      const [y, m] = ym.split('-').map(Number)
      ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    }
    return out
  }, [range])
  const max = Math.max(1, ...totals.values())

  return (
    <div className={cn('grid gap-5', months.length > 1 && 'md:grid-cols-2')}>
      {months.map((ym) => {
        const first = `${ym}-01`
        const offset = weekdayIndex(first)
        const last = Number(lastDayOfMonth(ym).slice(8))
        const monthTotal = [...totals.entries()].filter(([k]) => k.startsWith(ym)).reduce((s, [, v]) => s + v, 0)
        return (
          <div key={ym} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-extrabold text-ink">{monthLabel(ym)}</h3>
              <span className="text-xs font-bold text-danger">{formatMoney(monthTotal)}</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS_SHORT.map((w, i) => (
                <div key={w} className={cn('pb-1 text-[10px] font-bold uppercase text-gray-dark', i >= 5 && 'text-danger/70')}>
                  {w}
                </div>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: last }, (_, i) => {
                const key = addDays(first, i)
                const value = totals.get(key) ?? 0
                const outside = key < range.from || key > range.to || key > today
                // Ildiz shkala: bitta katta to'lov (masalan ijara) qolgan kunlarni oqartirib yubormasin.
                const ratio = Math.sqrt(value / max)
                const strong = ratio > 0.55
                return (
                  <button
                    key={key}
                    disabled={outside || value === 0}
                    onClick={() => onSelect(key)}
                    title={value ? `${i + 1}-kun: ${formatMoney(value)}` : undefined}
                    className={cn(
                      'flex h-12 min-w-0 flex-col items-center justify-center rounded-lg border text-[11px] transition-transform sm:h-14',
                      outside ? 'border-transparent opacity-30' : 'border-border',
                      value > 0 && !outside && 'cursor-pointer hover:scale-[1.04]',
                      selected === key && 'ring-2 ring-ink ring-offset-1',
                      key === today && selected !== key && 'ring-2 ring-brand-primary/50',
                    )}
                    style={
                      value > 0 && !outside
                        ? { backgroundColor: `color-mix(in srgb, var(--color-danger) ${Math.round(10 + ratio * 70)}%, white)`, borderColor: 'transparent' }
                        : undefined
                    }
                  >
                    <span className={cn('font-bold leading-none', strong ? 'text-white' : 'text-ink')}>{i + 1}</span>
                    {value > 0 && !outside && (
                      <span className={cn('mt-1 max-w-full truncate px-0.5 text-[9.5px] font-extrabold leading-none sm:text-[10.5px]', strong ? 'text-white' : 'text-danger')}>
                        <span className="sm:hidden">{axisMoney(value).replace('.', ',')}</span>
                        <span className="hidden sm:inline">{formatMoneyShort(value)}</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Turlari bo'yicha: eng katta chiqim manbalari, ulushi bilan. */
export function KindsList({
  kinds,
  total,
  active,
  onToggle,
}: {
  kinds: { key: string; name: string; amount: number; count: number }[]
  total: number
  active: string | null
  onToggle: (key: string) => void
}) {
  if (kinds.length === 0) return <p className="py-8 text-center text-sm text-gray-dark">Bu davrda chiqim yo'q</p>
  const max = Math.max(...kinds.map((k) => k.amount), 1)
  return (
    <ul className="space-y-1">
      {kinds.map((k) => (
        <li key={k.key}>
          <button
            onClick={() => onToggle(k.key)}
            className={cn(
              'w-full rounded-xl px-2.5 py-2 text-left transition-colors',
              active === k.key ? 'bg-danger-bg ring-1 ring-danger/30' : 'hover:bg-bg',
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-bold text-ink">
                {k.name} <span className="font-semibold text-gray-dark">· {k.count} ta</span>
              </span>
              <span className="shrink-0 font-bold text-ink">
                {formatMoney(k.amount)} <span className="font-semibold text-gray-dark">{Math.round((k.amount / Math.max(total, 1)) * 100)}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-danger" style={{ width: `${Math.max((k.amount / max) * 100, 3)}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

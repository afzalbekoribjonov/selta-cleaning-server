import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartColumnBig } from 'lucide-react'
import { businessDateKey } from '@/lib/business-time'
import { useDailyTrend, type DayStats } from '@/lib/daily-trend'
import { UZ_MONTHS_SHORT } from '@/lib/date-utils'
import { UNIT_LABELS, UNIT_ORDER, formatMoney, formatMoneyShort, formatQty } from '@/lib/units'
import { Panel, Segmented } from '@/components/ui/Panel'

type Metric = 'money' | 'washed' | 'delivered' | 'intake'

const METRICS: { value: Metric; label: string }[] = [
  { value: 'money', label: 'Kassa' },
  { value: 'washed', label: 'Yuvildi' },
  { value: 'delivered', label: 'Yetkazildi' },
  { value: 'intake', label: 'Sexga keldi' },
]

const COLORS = { primary: '#5a148c', secondary: '#b393d6', today: '#fac800', grid: '#ede8f3' }

function shortDay(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${d}-${(UZ_MONTHS_SHORT[m - 1] ?? '').toLowerCase()}`
}

interface Row {
  date: string
  label: string
  a: number
  b: number
  total: number
  today: boolean
}

/**
 * Oxirgi 14/30 kunlik grafik. Ma'lumot /adminDailyTrend dan — kunlik
 * ko'rsatkichlar bilan AYNAN bir xil hisob (o'tgan kunlar serverda
 * keshlangan, ochilish arzon). Yuvish hajmi birlik bo'yicha alohida
 * (m², dona, kg, metr bir-biriga qo'shilmaydi).
 */
export function TrendChart({ className }: { className?: string }) {
  const todayKey = businessDateKey(new Date())
  const [metric, setMetric] = useState<Metric>('money')
  const [range, setRange] = useState<'14' | '30'>('14')
  const [unit, setUnit] = useState<string>('sqm')
  const trend = useDailyTrend(todayKey, 31)

  const days = useMemo(() => (trend.data ?? []).slice(-Number(range)), [trend.data, range])

  // Yuvilgan hajmda qaysi birliklar bor — faqat shular tanlanadi.
  const units = useMemo(() => {
    const present = new Set<string>()
    for (const d of days) for (const [u, a] of Object.entries(d.washed.units)) if (a > 0) present.add(u)
    return UNIT_ORDER.filter((u) => present.has(u))
  }, [days])
  const activeUnit = units.includes(unit as never) ? unit : (units[0] ?? 'sqm')

  const rows: Row[] = useMemo(
    () =>
      days.map((d: DayStats) => {
        const base = { date: d.date, label: shortDay(d.date), today: d.date === todayKey }
        switch (metric) {
          case 'money':
            return { ...base, a: d.collected.cash, b: d.collected.card, total: d.collected.amount }
          case 'washed': {
            const v = d.washed.units[activeUnit] ?? 0
            return { ...base, a: v, b: 0, total: v }
          }
          case 'delivered':
            return { ...base, a: d.delivered.orderCount, b: 0, total: d.delivered.orderCount }
          default:
            return { ...base, a: d.intake.orderCount, b: 0, total: d.intake.orderCount }
        }
      }),
    [days, metric, activeUnit, todayKey],
  )

  const sum = rows.reduce((s, r) => s + r.total, 0)
  const avg = rows.length ? sum / rows.length : 0
  const fmt = (v: number) =>
    metric === 'money' ? formatMoney(v) : metric === 'washed' ? `${formatQty(v, activeUnit)} ${UNIT_LABELS[activeUnit]}` : `${Math.round(v)} ta`
  const fmtShort = (v: number) => (metric === 'money' ? formatMoneyShort(v) : formatQty(v, metric === 'washed' ? activeUnit : 'dona'))
  const unitTitle =
    metric === 'money' ? 'kassaga tushgan pul' : metric === 'washed' ? `yuvilgan hajm, ${UNIT_LABELS[activeUnit]}` : 'buyurtma'

  return (
    <Panel
      className={className}
      icon={ChartColumnBig}
      title="Kunlar kesimida"
      subtitle={`Oxirgi ${range} kun — ${unitTitle}`}
      actions={
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '14', label: '14 kun' },
            { value: '30', label: '30 kun' },
          ]}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={metric} onChange={setMetric} options={METRICS} />
        {metric === 'washed' && units.length > 1 && (
          <Segmented
            size="xs"
            value={activeUnit}
            onChange={setUnit}
            options={units.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl bg-bg px-3 py-2">
          <div className="text-[11px] font-semibold text-gray-dark">{range} kunda jami</div>
          <div className="truncate font-heading text-base font-extrabold tabular-nums text-ink" title={fmt(sum)}>
            {trend.isLoading ? '…' : fmt(sum)}
          </div>
        </div>
        <div className="min-w-0 rounded-xl bg-bg px-3 py-2">
          <div className="text-[11px] font-semibold text-gray-dark">Kuniga o'rtacha</div>
          <div className="truncate font-heading text-base font-extrabold tabular-nums text-ink" title={fmt(avg)}>
            {trend.isLoading ? '…' : fmt(avg)}
          </div>
        </div>
      </div>

      <div className="mt-3 h-[230px] w-full min-w-0">
        {trend.isLoading ? (
          <div className="h-full animate-pulse rounded-xl bg-bg" />
        ) : trend.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold text-danger">Grafikni yuklab bo'lmadi</p>
            <button onClick={() => trend.refetch()} className="text-xs font-bold text-brand-primary hover:underline">
              Qayta urinish
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={COLORS.grid} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#7a7482' }}
                interval="preserveStartEnd"
                minTickGap={14}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={metric === 'money' ? 66 : 36}
                tick={{ fontSize: 11, fill: '#7a7482' }}
                tickFormatter={fmtShort}
                allowDecimals={metric === 'washed'}
              />
              <Tooltip
                cursor={{ fill: 'rgba(90,20,140,0.06)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const r = payload[0].payload as Row
                  return (
                    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                      <div className="font-bold text-ink">
                        {r.label}
                        {r.today && ' · bugun'}
                      </div>
                      {metric === 'money' ? (
                        <>
                          <div className="mt-1 font-extrabold text-ink">{formatMoney(r.total)}</div>
                          <div className="text-gray-dark">Naqd: {formatMoney(r.a)}</div>
                          <div className="text-gray-dark">Karta: {formatMoney(r.b)}</div>
                        </>
                      ) : (
                        <div className="mt-1 font-extrabold text-ink">{fmt(r.total)}</div>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="a" stackId="s" fill={COLORS.primary} radius={metric === 'money' ? [0, 0, 0, 0] : [6, 6, 0, 0]} maxBarSize={34}>
                {rows.map((r) => (
                  <Cell key={r.date} fill={r.today && metric !== 'money' ? COLORS.today : COLORS.primary} />
                ))}
              </Bar>
              {metric === 'money' && (
                <Bar dataKey="b" stackId="s" fill={COLORS.secondary} radius={[6, 6, 0, 0]} maxBarSize={34} />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {metric === 'money' && (
        <div className="mt-2 flex items-center gap-4 text-[11px] font-semibold text-gray-dark">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.primary }} /> Naqd
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.secondary }} /> Karta
          </span>
          <span className="ml-auto">Yetkazish + yopilgan qarz + oldindan to'lov</span>
        </div>
      )}
    </Panel>
  )
}

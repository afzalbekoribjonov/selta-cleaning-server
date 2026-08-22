import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Megaphone, Table2 } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { ORDER_SOURCE_CONFIG } from '@/lib/order-sources'
import { Spinner } from '@/components/ui/Spinner'
import type { Order } from '@/lib/orders'

type RangeKey = 'week' | 'month'

const UNKNOWN_KEY = 'unknown'
const UNKNOWN_LABEL = 'Aniqlanmagan'
const UNKNOWN_COLOR = '#AAA5AF'

interface Row {
  key: string
  label: string
  color: string
  count: number
  percent: number
}

function startOfRange(range: RangeKey): Date {
  const now = new Date()
  const start = new Date(now)
  if (range === 'week') {
    start.setDate(now.getDate() - 7)
  } else {
    start.setMonth(now.getMonth() - 1)
  }
  return start
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg">
      <div className="text-xs font-bold text-ink">{row.label}</div>
      <div className="mt-0.5 text-sm font-extrabold" style={{ color: row.color }}>
        {row.count} ta buyurtma · {row.percent.toFixed(0)}%
      </div>
    </div>
  )
}

/**
 * Marketing statistikasi — talab: sotuv menejeri buyurtma yaratishda
 * belgilagan "Manba" (Instagram, Telegram va h.k.) bo'yicha, foizlarda va
 * diagrammada, haftalik/oylik ko'rinishda tahlil. Dashboard'dagi boshqa
 * grafiklar bilan bir xil naqsh: real-vaqtli, cheklangan oyna
 * (useRecentOrders), butun jamlanma hech qachon bir yo'la yuklanmaydi.
 */
export default function MarketingStatsPage() {
  const [range, setRange] = useState<RangeKey>('week')
  const { orders, loading } = useRecentOrders()

  const rows = useMemo<Row[]>(() => {
    const list: Order[] = orders ?? []
    const cutoff = startOfRange(range)
    const inRange = list.filter((o) => o.createdAt >= cutoff)

    const tally: Record<string, number> = {}
    for (const o of inRange) {
      const key = o.source && ORDER_SOURCE_CONFIG[o.source] ? o.source : UNKNOWN_KEY
      tally[key] = (tally[key] ?? 0) + 1
    }
    const total = inRange.length

    const sourceRows = Object.entries(ORDER_SOURCE_CONFIG).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      color: cfg.color,
      count: tally[key] ?? 0,
      percent: total > 0 ? ((tally[key] ?? 0) / total) * 100 : 0,
    }))
    if (tally[UNKNOWN_KEY]) {
      sourceRows.push({
        key: UNKNOWN_KEY,
        label: UNKNOWN_LABEL,
        color: UNKNOWN_COLOR,
        count: tally[UNKNOWN_KEY],
        percent: total > 0 ? (tally[UNKNOWN_KEY] / total) * 100 : 0,
      })
    }
    return sourceRows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count)
  }, [orders, range])

  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const chartHeight = Math.max(rows.length * 44, 140)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Marketing statistikasi</h1>
          <p className="mt-1 text-sm text-gray-dark">Buyurtmalar qaysi manbadan kelayotgani — sotuv menejeri belgilagan "Manba" asosida</p>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1">
          <button
            onClick={() => setRange('week')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${range === 'week' ? 'bg-brand-primary text-white' : 'text-ink/70'}`}
          >
            Haftalik
          </button>
          <button
            onClick={() => setRange('month')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${range === 'month' ? 'bg-brand-primary text-white' : 'text-ink/70'}`}
          >
            Oylik
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner className="py-16" />
      ) : totalCount === 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-10 text-center">
          <Megaphone size={28} className="mx-auto text-gray" />
          <p className="mt-3 text-sm font-semibold text-gray-dark">
            {range === 'week' ? 'Bu hafta' : 'Bu oy'} hali buyurtma yo'q
          </p>
        </section>
      ) : (
        <>
          <BannerRow rows={rows} totalCount={totalCount} />

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Megaphone size={18} className="text-brand-primary" />
              <h2 className="font-heading font-bold text-ink">Manba bo'yicha taqsimot</h2>
            </div>
            <p className="mb-4 text-xs text-gray-dark">
              Jami {totalCount} ta buyurtma · {range === 'week' ? "so'nggi 7 kun" : "so'nggi 30 kun"}
            </p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  width={120}
                  tick={{ fill: 'var(--color-ink)', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg)' }} />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={26}
                  isAnimationActive
                  label={{ position: 'right', fill: 'var(--color-ink)', fontSize: 12, fontWeight: 700 }}
                >
                  {rows.map((r) => (
                    <Cell key={r.key} fill={r.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <TableView rows={rows} totalCount={totalCount} />
        </>
      )}
    </div>
  )
}

/** "Harakatchan statistika bannerlari" — talab: har bir manba uchun foiz
 * va son, ochilganda 0dan haqiqiy qiymatga animatsiyalanib to'ladigan
 * progress-bar bilan. */
function BannerRow({ rows, totalCount }: { rows: Row[]; totalCount: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <SourceBanner key={r.key} row={r} totalCount={totalCount} />
      ))}
    </div>
  )
}

function SourceBanner({ row, totalCount }: { row: Row; totalCount: number }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(row.percent), 80)
    return () => clearTimeout(t)
  }, [row.percent])

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{row.label}</span>
        <span className="text-xs font-semibold text-gray-dark">
          {row.count}/{totalCount} ta
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-extrabold" style={{ color: row.color }}>
          {row.percent.toFixed(0)}%
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: row.color }}
        />
      </div>
    </div>
  )
}

/** Jadval ko'rinishi — dataviz talabi: rangdan mustaqil, to'liq o'qilishi mumkin bo'lgan muqobil. */
function TableView({ rows, totalCount }: { rows: Row[]; totalCount: number }) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Table2 size={16} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Jadval ko'rinishi</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-gray-dark">
              <th className="px-5 py-3 font-semibold">Manba</th>
              <th className="px-5 py-3 text-right font-semibold">Buyurtmalar</th>
              <th className="px-5 py-3 text-right font-semibold">Ulush</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-bold text-ink">{r.count}</td>
                <td className="px-5 py-3 text-right font-bold text-ink">{r.percent.toFixed(0)}%</td>
              </tr>
            ))}
            <tr>
              <td className="px-5 py-3 font-bold text-ink">Jami</td>
              <td className="px-5 py-3 text-right font-bold text-ink">{totalCount}</td>
              <td className="px-5 py-3 text-right font-bold text-ink">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

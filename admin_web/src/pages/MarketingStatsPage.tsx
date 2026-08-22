import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Megaphone, Table2, Plus, Trash2, Settings2 } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useOrderSources } from '@/hooks/useOrderSources'
import { ORDER_SOURCE_COLOR_SWATCHES, type OrderSource } from '@/lib/order-sources'
import { apiPost, ApiError } from '@/lib/api'
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
  const { sources } = useOrderSources()

  // Bo'sh bo'lsa (birinchi marta ochilganda) boshlang'ich 5 ta manbani
  // bir martalik, xavfsiz (idempotent) tarzda to'ldiradi — server buni
  // faqat kolleksiya bo'sh bo'lsa amalga oshiradi.
  useEffect(() => {
    apiPost('/adminEnsureDefaultOrderSources', {}).catch(() => {})
  }, [])

  const rows = useMemo<Row[]>(() => {
    const list: Order[] = orders ?? []
    const cutoff = startOfRange(range)
    const inRange = list.filter((o) => o.createdAt >= cutoff)

    const tally: Record<string, number> = {}
    for (const o of inRange) {
      const key = o.source && sources.some((s) => s.id === o.source) ? o.source : UNKNOWN_KEY
      tally[key] = (tally[key] ?? 0) + 1
    }
    const total = inRange.length

    const sourceRows = sources.map((s) => ({
      key: s.id,
      label: s.name,
      color: s.color,
      count: tally[s.id] ?? 0,
      percent: total > 0 ? ((tally[s.id] ?? 0) / total) * 100 : 0,
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
  }, [orders, range, sources])

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

      <ManageSourcesSection sources={sources} />

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

/** Talab: manbalar admin panel orqali qo'shilishi/o'chirilishi mumkin
 * bo'lsin — sotuv menejerining "Manba" tanlovi shu ro'yxatdan keladi. */
function ManageSourcesSection({ sources }: { sources: OrderSource[] }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(ORDER_SOURCE_COLOR_SWATCHES[0])
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderSource | null>(null)
  const queryClient = useQueryClient()

  const addMutation = useMutation({
    mutationFn: () => apiPost('/adminCreateOrderSource', { name: name.trim(), color }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setName('')
      setAdding(false)
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  const deleteMutation = useMutation({
    mutationFn: (sourceId: string) => apiPost('/adminDeleteOrderSource', { sourceId }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setDeleteTarget(null)
    },
  })

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Manbalarni boshqarish</h2>
        </div>
        <span className="text-xs font-semibold text-gray-dark">{open ? 'Yopish' : `${sources.length} ta — ko'rsatish`}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-xs font-bold text-white" style={{ backgroundColor: s.color }}>
                {s.name}
                <button
                  onClick={() => setDeleteTarget(s)}
                  className="rounded-full p-1 hover:bg-black/15"
                  title="O'chirish"
                  aria-label={`${s.name} manbasini o'chirish`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {sources.length === 0 && <p className="text-sm text-gray-dark">Hali manba qo'shilmagan</p>}
          </div>

          {adding ? (
            <div className="rounded-xl border border-border bg-bg p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Manba nomi (masalan: TikTok)"
                  className="min-w-[180px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
                />
                <div className="flex items-center gap-1.5">
                  {ORDER_SOURCE_COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`h-6 w-6 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-brand-primary' : ''}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Rang ${c}`}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setAdding(false)
                    setError(null)
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={() => name.trim() && addMutation.mutate()}
                  disabled={addMutation.isPending || !name.trim()}
                  className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {addMutation.isPending ? '...' : 'Qoʻshish'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-bold text-brand-primary"
            >
              <Plus size={14} />
              Yangi manba qo'shish
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-ink">
              <strong>{deleteTarget.name}</strong> manbasi o'chirilsinmi? Bu manba bilan yaratilgan buyurtmalarda "Aniqlanmagan" sifatida ko'rinadi.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl border border-border py-2 text-sm font-bold text-ink">
                Bekor qilish
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl bg-danger py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {deleteMutation.isPending ? '...' : "O'chirish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
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

import { useCallback, useEffect, useState } from 'react'
import {
  Warehouse,
  Droplets,
  Truck,
  Wallet,
  Package,
  Ruler,
  RefreshCw,
  ChevronRight,
  X,
  AlertCircle,
} from 'lucide-react'
import { fetchDailyStats, formatMoney, formatQty, trimNumber, type DailyStats, type StatEntry } from '@/lib/stats'
import { describeApiError } from '@/lib/api'
import { SeltaLoader } from '@/components/SeltaLoader'

export default function StatsPage() {
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<{ title: string; entries: StatEntry[] } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStats(await fetchDailyStats())
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !stats) {
    return <SeltaLoader label="Ko'rsatkichlar yuklanmoqda..." className="py-24" />
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center gap-4 px-8 py-20 text-center">
        <AlertCircle size={40} className="text-danger" />
        <p className="text-sm font-bold text-ink">{error}</p>
        <button onClick={load} className="rounded-2xl border border-border px-5 py-2.5 text-sm font-bold text-ink">
          Qayta urinish
        </button>
      </div>
    )
  }

  if (!stats) return null

  const washedLabel =
    stats.washedToday.totals.length === 0
      ? '0'
      : stats.washedToday.totals.map((t) => `${trimNumber(t.amount)} ${t.unit}`).join(' · ')

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-brand-primary to-brand-primary-dark px-4 py-3.5">
        <div>
          <p className="text-sm font-extrabold text-white">Bugungi holat</p>
          <p className="text-xs text-white/70">{stats.date}</p>
        </div>
        <button
          onClick={load}
          aria-label="Yangilash"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white active:scale-95"
        >
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-success/25 bg-success-bg p-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <Wallet size={17} className="text-success" />
            Topshirilishi kerak
          </span>
          {stats.cashToHandOver.entries.length > 0 && (
            <ViewButton
              onClick={() => setSheet({ title: "Bugun yig'ilgan summa", entries: stats.cashToHandOver.entries })}
            />
          )}
        </div>
        <p className="mt-2 font-heading text-3xl font-extrabold text-success">
          {formatMoney(stats.cashToHandOver.total)}
        </p>
        <p className="text-[11px] font-semibold text-gray-dark">Bugun yetkazilgan buyurtmalardan</p>
      </div>

      <div className="mt-3 space-y-2.5">
        <StatCard
          icon={Warehouse}
          tone="primary"
          label="Bugun sexga keldi"
          value={`${stats.broughtInToday.count} ta buyurtma`}
          entries={stats.broughtInToday.orders}
          onOpen={() => setSheet({ title: 'Bugun sexga kelgan buyurtmalar', entries: stats.broughtInToday.orders })}
        />
        <StatCard
          icon={Droplets}
          tone="info"
          label="Bugun yuvildi"
          value={washedLabel}
          sub={`${stats.washedToday.count} ta mahsulot`}
          entries={stats.washedToday.items}
          onOpen={() => setSheet({ title: 'Bugun yuvilgan mahsulotlar', entries: stats.washedToday.items })}
        />
        <StatCard
          icon={Truck}
          tone="success"
          label="Bugun yetgazildi"
          value={`${stats.deliveredToday.count} ta buyurtma`}
          entries={stats.deliveredToday.orders}
          onOpen={() => setSheet({ title: 'Bugun yetkazilgan buyurtmalar', entries: stats.deliveredToday.orders })}
        />
      </div>

      <p className="mb-2 mt-6 text-[11px] font-extrabold uppercase tracking-wide text-gray">Joriy holat</p>
      <div className="space-y-2.5">
        <StatCard
          icon={Droplets}
          tone="info"
          label="Hozir yuvilmoqda"
          value={`${stats.washingNow.count} ta mahsulot`}
          sub={`${stats.washingNow.orderCount} ta buyurtmada`}
          entries={stats.washingNow.items}
          onOpen={() => setSheet({ title: 'Hozir yuvilayotgan mahsulotlar', entries: stats.washingNow.items })}
        />
        <StatCard
          icon={Package}
          tone="success"
          label="Yetgazishga tayyor"
          value={`${stats.readyToDeliver.count} ta mahsulot`}
          sub={`${stats.readyToDeliver.orderCount} ta buyurtmada`}
          entries={stats.readyToDeliver.items}
          onOpen={() => setSheet({ title: 'Yetgazishga tayyor mahsulotlar', entries: stats.readyToDeliver.items })}
        />
        <StatCard
          icon={Ruler}
          tone="danger"
          label="O'lchanmagan buyurtmalar"
          value={`${stats.unmeasured.count} ta buyurtma`}
          sub={stats.unmeasured.count > 0 ? "Narxi 0 so'm — o'lchash kerak" : undefined}
          highlight={stats.unmeasured.count > 0}
          entries={stats.unmeasured.orders}
          onOpen={() => setSheet({ title: "O'lchanmagan mahsulotli buyurtmalar", entries: stats.unmeasured.orders })}
        />
      </div>

      {sheet && <EntriesSheet title={sheet.title} entries={sheet.entries} onClose={() => setSheet(null)} />}
    </div>
  )
}

const TONES = {
  primary: 'bg-brand-primary/10 text-brand-primary',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  entries,
  highlight,
  onOpen,
}: {
  icon: typeof Warehouse
  tone: keyof typeof TONES
  label: string
  value: string
  sub?: string
  entries: StatEntry[]
  highlight?: boolean
  onOpen: () => void
}) {
  const disabled = entries.length === 0
  return (
    <button
      onClick={disabled ? undefined : onOpen}
      disabled={disabled}
      className={`flex w-full items-center gap-3.5 rounded-2xl border bg-surface p-4 text-left active:scale-[0.99] disabled:active:scale-100 ${
        highlight ? 'border-danger/40' : 'border-border'
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-dark">{label}</p>
        <p className={`text-base font-extrabold ${highlight ? 'text-danger' : 'text-ink'}`}>{value}</p>
        {sub && <p className={`text-[11px] font-semibold ${highlight ? 'text-danger' : 'text-gray'}`}>{sub}</p>}
      </div>
      {!disabled && <ChevronRight size={18} className="shrink-0 text-gray" />}
    </button>
  )
}

function ViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs font-extrabold text-success active:scale-95">
      Ko'rish
    </button>
  )
}

function EntriesSheet({ title, entries, onClose }: { title: string; entries: StatEntry[]; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/50" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full overflow-hidden rounded-t-3xl bg-bg pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-base font-extrabold text-ink">{title}</p>
            <p className="text-xs text-gray-dark">{entries.length} ta</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-dark active:scale-95">
            <X size={19} />
          </button>
        </div>
        <div className="max-h-[65dvh] space-y-2 overflow-y-auto p-4">
          {entries.map((e, i) => (
            <div key={`${e.orderNumber}-${i}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
              <span className="shrink-0 rounded-lg bg-brand-primary/10 px-2 py-1 text-xs font-extrabold text-brand-primary">
                #{e.orderNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{e.customerName || "Noma'lum mijoz"}</p>
                {(e.itemName || e.phone) && (
                  <p className="truncate text-xs text-gray-dark">{e.itemName ?? e.phone}</p>
                )}
              </div>
              {e.amount != null ? (
                <span className="shrink-0 text-sm font-extrabold text-success">{formatMoney(e.amount)}</span>
              ) : (
                formatQty(e) && <span className="shrink-0 text-xs font-bold text-gray-dark">{formatQty(e)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

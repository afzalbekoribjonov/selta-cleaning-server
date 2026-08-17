import { useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, TrendingUp, TrendingDown, Wallet, Sparkles, CalendarRange } from 'lucide-react'
import { useExpenses } from '@/hooks/useExpenses'
import { useYearlyReport, type MonthReport } from '@/hooks/useYearlyReport'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Spinner } from '@/components/ui/Spinner'

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}${Math.round(Math.abs(value)).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function formatCompact(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1000)}k`
  return `${sign}${abs}`
}

export default function MonthlyReportPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { expenses } = useExpenses()
  const { months, loading, error } = useYearlyReport(year, expenses)

  const now = new Date()
  const isCurrentYear = year === now.getFullYear()
  const currentMonth = isCurrentYear ? now.getMonth() : -1

  const yearTotals = months?.reduce(
    (acc, m) => ({
      orders: acc.orders + m.orderCount,
      revenue: acc.revenue + m.revenue,
      expenses: acc.expenses + m.expenses + m.payroll,
      profit: acc.profit + m.profit,
    }),
    { orders: 0, revenue: 0, expenses: 0, profit: 0 },
  )

  return (
    <div className="space-y-8">
      <style>{`
        @keyframes monthCardIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .month-card-anim { animation: monthCardIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Oylik hisobot</h1>
          <p className="mt-1 text-sm text-gray-dark">Har oy bo'yicha buyurtmalar, tushum va foyda — yil kesimida</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-1.5">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg p-1.5 text-gray-dark hover:bg-bg hover:text-ink" aria-label="Oldingi yil">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[64px] text-center font-heading text-lg font-extrabold text-ink">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= now.getFullYear()}
            className="rounded-lg p-1.5 text-gray-dark hover:bg-bg hover:text-ink disabled:opacity-30"
            aria-label="Keyingi yil"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Yillik xulosa — brend gradient banner */}
      <section
        className="relative overflow-hidden rounded-3xl p-6 shadow-lg sm:p-8"
        style={{ background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-primary-dark))' }}
      >
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 right-24 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-2 text-white/80">
          <Sparkles size={16} className="text-brand-accent" />
          <span className="text-sm font-bold">{year}-yil xulosasi</span>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <HeroStat label="Buyurtmalar" value={yearTotals?.orders ?? 0} loading={loading} />
          <HeroStat label="Tushum" value={yearTotals?.revenue ?? 0} loading={loading} money />
          <HeroStat label="Chiqimlar" value={yearTotals?.expenses ?? 0} loading={loading} money />
          <HeroStat label="Sof foyda" value={yearTotals?.profit ?? 0} loading={loading} money highlight />
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-danger/30 bg-danger-bg p-5 text-sm text-danger">
          Ma'lumotni yuklab bo'lmadi: {error.message}
        </div>
      )}

      {loading && <Spinner className="p-16" />}

      {!loading && months && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {months.map((m, i) => (
            <MonthCard key={m.month} report={m} delay={i * 0.04} isCurrent={m.month === currentMonth} isFuture={isCurrentYear && m.month > currentMonth} />
          ))}
        </div>
      )}
    </div>
  )
}

function HeroStat({ label, value, loading, money, highlight }: { label: string; value: number; loading: boolean; money?: boolean; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold text-white/70">{label}</div>
      <div className={`mt-1 font-heading text-xl font-extrabold sm:text-2xl ${highlight ? (value >= 0 ? 'text-brand-accent' : 'text-red-300') : 'text-white'}`}>
        {loading ? '—' : <AnimatedNumber value={value} format={money ? formatMoney : (n) => String(n)} />}
      </div>
    </div>
  )
}

function MonthCard({ report, delay, isCurrent, isFuture }: { report: MonthReport; delay: number; isCurrent: boolean; isFuture: boolean }) {
  const profitable = report.profit >= 0
  const hasActivity = report.orderCount > 0 || report.expenses > 0 || report.payroll > 0

  return (
    <div
      className={`month-card-anim rounded-2xl border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md ${
        isCurrent ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-border'
      } ${isFuture ? 'opacity-50' : ''}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange size={16} className={isCurrent ? 'text-brand-primary' : 'text-gray'} />
          <h3 className="font-heading font-bold text-ink">{report.label}</h3>
        </div>
        {isCurrent && <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">Joriy oy</span>}
      </div>

      {isFuture || !hasActivity ? (
        <p className="py-4 text-center text-xs text-gray-dark">{isFuture ? 'Hali kelmagan' : "Ma'lumot yo'q"}</p>
      ) : (
        <div className="space-y-2.5">
          <Row icon={ClipboardList} label="Buyurtmalar" value={<AnimatedNumber value={report.orderCount} />} />
          <Row icon={TrendingUp} label="Tushum" value={<AnimatedNumber value={report.revenue} format={formatCompact} />} tone="success" />
          <Row icon={Wallet} label="Chiqim (maosh + boshqa)" value={<AnimatedNumber value={report.payroll + report.expenses} format={formatCompact} />} tone="danger" />
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
              {profitable ? <TrendingUp size={13} className="text-success" /> : <TrendingDown size={13} className="text-danger" />}
              Sof foyda
            </span>
            <span className={`text-sm font-extrabold ${profitable ? 'text-success' : 'text-danger'}`}>
              {profitable ? '+' : ''}
              <AnimatedNumber value={report.profit} format={formatCompact} />
            </span>
          </div>
          {!report.payrollComputed && (
            <p className="pt-1 text-[10px] text-gray-dark">* Maosh bu oy uchun hali hisoblanmagan</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ClipboardList
  label: string
  value: React.ReactNode
  tone?: 'success' | 'danger'
}) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-gray-dark">
        <Icon size={13} />
        {label}
      </span>
      <span className={`font-bold ${toneClass}`}>{value}</span>
    </div>
  )
}

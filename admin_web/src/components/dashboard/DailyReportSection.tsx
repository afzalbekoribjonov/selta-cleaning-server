import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Factory,
  Droplets,
  PackageCheck,
  Truck,
  Wallet,
  CalendarDays,
  Check,
  Undo2,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { businessDateKey } from '@/lib/attendance'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import {
  fetchDailyReport,
  setCashHandover,
  formatMoney,
  formatUnitTotals,
  type DailyReport,
} from '@/lib/daily-report'
import { DailyReportDrawer, type DrawerKind } from './DailyReportDrawer'

/** "2026-09-05" -> "5-sentabr, 2026" */
function formatDateKeyUz(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${d}-${(UZ_MONTHS_FULL[m - 1] ?? '').toLowerCase()}, ${y}`
}

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

/**
 * "Kunlik ko'rsatkichlar" — boshqaruv panelining eng tepasidagi bo'lim.
 *
 * Istalgan kunni kalendardan tanlash mumkin; har bir ko'rsatkichning
 * "Ko'rish" tugmasi aynan qaysi buyurtma/mahsulot hisobga olinganini
 * ID lari bilan ochadi. Butun bo'lim uchun serverga BITTA so'rov
 * yuboriladi (/adminDailyReport) — batafsil ro'yxatlar ham shu javob
 * ichida keladi, shuning uchun "Ko'rish" bosilganda kutish yo'q.
 */
export function DailyReportSection() {
  const todayKey = businessDateKey(new Date())
  const [date, setDate] = useState(todayKey)
  const [drawer, setDrawer] = useState<DrawerKind | null>(null)

  const report = useQuery({
    queryKey: ['dailyReport', date],
    queryFn: () => fetchDailyReport(date),
    // Bugungi kun jonli o'zgaradi, o'tgan kunlar esa o'zgarmaydi.
    staleTime: date === todayKey ? 30_000 : Infinity,
  })

  const data = report.data

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-extrabold text-ink">Kunlik ko'rsatkichlar</h2>
          <p className="mt-0.5 text-xs text-gray-dark sm:text-sm">
            {date === todayKey ? 'Bugun' : formatDateKeyUz(date)} — sex, yuvish, upakovka va yetkazish
          </p>
        </div>

        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <button
            onClick={() => setDate(shiftDateKey(date, -1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-gray-dark hover:bg-bg"
            aria-label="Oldingi kun"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
            <input
              type="date"
              value={date}
              max={todayKey}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm font-semibold text-ink outline-none focus:border-brand-primary sm:w-44"
            />
          </div>
          <button
            onClick={() => setDate(shiftDateKey(date, 1))}
            disabled={date >= todayKey}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-gray-dark hover:bg-bg disabled:opacity-40"
            aria-label="Keyingi kun"
          >
            <ChevronRight size={18} />
          </button>
          {date !== todayKey && (
            <button
              onClick={() => setDate(todayKey)}
              className="h-10 shrink-0 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white"
            >
              Bugun
            </button>
          )}
        </div>
      </header>

      {report.isLoading ? (
        <Spinner className="py-10" />
      ) : report.isError ? (
        <p className="py-10 text-center text-sm font-semibold text-danger">Ko'rsatkichlarni yuklab bo'lmadi</p>
      ) : !data ? null : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Factory}
              tone="primary"
              label="Sexga keldi"
              primary={formatUnitTotals(data.intake.totals)}
              lines={[
                `${data.intake.orderCount} ta buyurtma · ${data.intake.itemCount} ta mahsulot`,
                data.intake.unmeasuredCount > 0 ? `${data.intake.unmeasuredCount} ta hali o'lchanmagan` : null,
              ]}
              warn={data.intake.unmeasuredCount > 0}
              onView={() => setDrawer('intake')}
              disabled={data.intake.orderCount === 0}
            />
            <MetricCard
              icon={Droplets}
              tone="info"
              label="Yuvildi"
              primary={formatUnitTotals(data.washed.totals)}
              lines={[`${data.washed.count} ta mahsulot · ${data.washed.orderCount} ta buyurtma`]}
              onView={() => setDrawer('washed')}
              disabled={data.washed.count === 0}
            />
            <MetricCard
              icon={PackageCheck}
              tone="warning"
              label="Upakovka qilindi"
              primary={formatUnitTotals(data.packed.totals)}
              lines={[`${data.packed.count} ta mahsulot · ${data.packed.orderCount} ta buyurtma`]}
              onView={() => setDrawer('packed')}
              disabled={data.packed.count === 0}
            />
            <MetricCard
              icon={Truck}
              tone="success"
              label="Yetkazildi"
              primary={`${data.delivered.orderCount} ta buyurtma`}
              lines={[
                `${data.delivered.count} ta mahsulot · ${formatUnitTotals(data.delivered.totals)}`,
                formatMoney(data.delivered.deliveredAmount),
              ]}
              onView={() => setDrawer('delivered')}
              disabled={data.delivered.count === 0}
            />
          </div>

          <DriversCashPanel date={date} report={data} />

          {!data.hasActivityLog && !data.isToday && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-bg px-3 py-2.5 text-xs text-gray-dark">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              Bu kunda yuvish, upakovka va yetkazish yozuvi yo'q — kun tinch o'tgan yoki kunlik jurnal joriy
              etilishidan oldingi kun bo'lishi mumkin. "Sexga keldi" ko'rsatkichi har ikkala holatda ham to'g'ri.
            </p>
          )}
        </>
      )}

      {drawer && data && (
        <DailyReportDrawer
          kind={drawer}
          date={date}
          rows={drawer === 'intake' ? [] : data[drawer].rows}
          intakeOrders={data.intake.orders}
          totals={drawer === 'intake' ? data.intake.totals : data[drawer].totals}
          onClose={() => setDrawer(null)}
        />
      )}
    </section>
  )
}

const TONES: Record<string, { icon: string; ring: string }> = {
  primary: { icon: 'bg-brand-primary/10 text-brand-primary', ring: 'hover:border-brand-primary/40' },
  info: { icon: 'bg-info-bg text-info', ring: 'hover:border-info/40' },
  warning: { icon: 'bg-warning-bg text-warning', ring: 'hover:border-warning/40' },
  success: { icon: 'bg-success-bg text-success', ring: 'hover:border-success/40' },
}

function MetricCard({
  icon: Icon,
  tone,
  label,
  primary,
  lines,
  warn,
  onView,
  disabled,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  primary: string
  lines: (string | null)[]
  warn?: boolean
  onView: () => void
  disabled?: boolean
}) {
  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-bg/40 p-4 transition-colors ${TONES[tone].ring}`}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone].icon}`}>
          <Icon size={17} />
        </div>
        <span className="truncate text-sm font-bold text-ink">{label}</span>
      </div>

      <div className="mt-3 min-w-0 flex-1">
        <div className="truncate font-heading text-xl font-extrabold leading-tight text-ink" title={primary}>
          {primary}
        </div>
        {lines.filter(Boolean).map((line, i) => (
          <div key={i} className={`mt-0.5 truncate text-xs ${warn && i > 0 ? 'font-bold text-danger' : 'text-gray-dark'}`}>
            {line}
          </div>
        ))}
      </div>

      <button
        onClick={onView}
        disabled={disabled}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-xs font-bold text-ink transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink"
      >
        <Eye size={14} />
        Ko'rish
      </button>
    </div>
  )
}

/**
 * Dastavchiklar qo'lidagi pul — shu kuni yetkazgan buyurtmalari
 * summasidan. Qoldiq kundan-kunga o'tmaydi (talab): har kun o'z
 * hisobiga ega, "Topshirdi" belgisi ham aynan shu kunga tegishli.
 */
function DriversCashPanel({ date, report }: { date: string; report: DailyReport }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ employeeId, handedOver, amount }: { employeeId: string; handedOver: boolean; amount: number }) =>
      setCashHandover(date, employeeId, handedOver, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailyReport', date] }),
  })

  const pending = useMemo(
    () => report.drivers.filter((d) => !d.handedOver).reduce((sum, d) => sum + d.amount, 0),
    [report.drivers],
  )

  if (report.drivers.length === 0) return null

  return (
    <div className="mt-3 rounded-2xl border border-border bg-bg/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
            <Wallet size={17} />
          </div>
          <div>
            <div className="text-sm font-bold text-ink">Dastavchiklar qo'lidagi pul</div>
            <div className="text-xs text-gray-dark">Shu kuni yetkazgan buyurtmalari summasi</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-heading text-lg font-extrabold text-ink">{formatMoney(pending)}</div>
          <div className="text-xs text-gray-dark">topshirilmagan</div>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {report.drivers.map((d) => (
          <li
            key={d.employeeId}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 ${
              d.handedOver ? 'border-success/30 bg-success-bg/40' : 'border-border bg-surface'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-ink">{d.name}</div>
              <div className="text-xs text-gray-dark">
                {d.orderCount} ta buyurtma · {d.itemCount} ta mahsulot
              </div>
            </div>
            <div
              className={`font-heading text-base font-extrabold ${d.handedOver ? 'text-success line-through' : 'text-ink'}`}
            >
              {formatMoney(d.amount)}
            </div>
            <button
              onClick={() => mutation.mutate({ employeeId: d.employeeId, handedOver: !d.handedOver, amount: d.amount })}
              disabled={mutation.isPending}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                d.handedOver
                  ? 'border border-border bg-bg text-gray-dark hover:text-ink'
                  : 'bg-brand-primary text-white hover:opacity-90'
              }`}
            >
              {d.handedOver ? <Undo2 size={14} /> : <Check size={14} />}
              {d.handedOver ? 'Bekor qilish' : 'Topshirdi'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

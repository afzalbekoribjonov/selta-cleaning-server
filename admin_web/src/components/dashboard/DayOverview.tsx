import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  Droplets,
  Factory,
  PackageCheck,
  Receipt,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { businessDateKey } from '@/lib/business-time'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { fetchDailyReport, runDailyActivityBackfill, type UnitTotal } from '@/lib/daily-report'
import { shiftDateKey, useDailyTrend, type DayStats } from '@/lib/daily-trend'
import { countOrdersCreatedOn } from '@/lib/orders'
import { formatMoney, formatQty } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { DailyReportDrawer, type DrawerKind } from './DailyReportDrawer'
import { DailyReceiptDialog } from './DailyReceiptDialog'
import { CashPanel } from './CashPanel'

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']

/** "2026-11-03" -> "3-noyabr, Seshanba" */
function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${d}-${(UZ_MONTHS_FULL[m - 1] ?? '').toLowerCase()}, ${WEEKDAYS[weekday]}`
}

/**
 * "Kunlik ko'rsatkichlar" — tanlangan kunning butun oqimi: qabul qilindi →
 * sexga keldi → yuvildi → upakovka → yetkazildi, har biri birlik bo'yicha
 * hajm (m², metr, kg, dona) va kechagi kun bilan farqi bilan; ostida kassa.
 *
 * Bosqichlar bitta so'rov bilan keladi (/adminDailyReport); karta bosilsa
 * aynan qaysi buyurtma/mahsulot hisobga olingani ochiladi (kutishsiz).
 */
export function DayOverview() {
  const todayKey = businessDateKey(new Date())
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayKey)
  const [drawer, setDrawer] = useState<DrawerKind | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const isToday = date === todayKey

  // Kunlik jurnal joriy etilishidan oldingi kunlarni bir marta to'ldirish
  // (server belgi qo'yadi, keyingi ochilishlarda darhol qaytadi).
  useEffect(() => {
    let cancelled = false
    runDailyActivityBackfill()
      .then((didWork) => {
        if (didWork && !cancelled) queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [queryClient])

  const report = useQuery({
    queryKey: ['dailyReport', date],
    queryFn: () => fetchDailyReport(date),
    staleTime: isToday ? 30_000 : Infinity,
  })
  const created = useQuery({
    queryKey: ['ordersCreated', date],
    queryFn: async () => ({ today: await countOrdersCreatedOn(date), prev: await countOrdersCreatedOn(shiftDateKey(date, -1)) }),
    staleTime: isToday ? 30_000 : Infinity,
  })
  // Kechagi kun bilan solishtirish uchun — o'tgan kunlar serverda keshlangan.
  const trend = useDailyTrend(date, 7)
  const prev = useMemo<DayStats | null>(
    () => trend.data?.find((d) => d.date === shiftDateKey(date, -1)) ?? null,
    [trend.data, date],
  )

  const data = report.data

  return (
    <Panel
      title="Kunlik ko'rsatkichlar"
      subtitle={`${isToday ? 'Bugun · ' : ''}${dayLabel(date)}`}
      actions={
        <>
          <button
            onClick={() => setDate(shiftDateKey(date, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-gray-dark hover:bg-bg"
            aria-label="Oldingi kun"
          >
            <ChevronLeft size={17} />
          </button>
          <label className="relative">
            <CalendarDays size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray" />
            <input
              type="date"
              value={date}
              max={todayKey}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-9 w-[150px] rounded-xl border border-border bg-bg pl-8 pr-2 text-sm font-semibold text-ink outline-none focus:border-brand-primary"
              aria-label="Kunni tanlash"
            />
          </label>
          <button
            onClick={() => setDate(shiftDateKey(date, 1))}
            disabled={date >= todayKey}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-gray-dark hover:bg-bg disabled:opacity-40"
            aria-label="Keyingi kun"
          >
            <ChevronRight size={17} />
          </button>
          {!isToday && (
            <button onClick={() => setDate(todayKey)} className="h-9 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white">
              Bugun
            </button>
          )}
          <button
            onClick={() => setReceiptOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-brand-primary px-3 text-xs font-bold text-brand-primary hover:bg-brand-primary/5"
            title="Kunlik hisobot cheki"
          >
            <Receipt size={15} />
            Chek
          </button>
        </>
      }
    >
      {report.isLoading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[150px] animate-pulse rounded-2xl bg-bg" />
          ))}
        </div>
      ) : report.isError || !data ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm font-semibold text-danger">Ko'rsatkichlarni yuklab bo'lmadi</p>
          <button onClick={() => report.refetch()} className="text-xs font-bold text-brand-primary hover:underline">
            Qayta urinish
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5 [&>*]:min-w-0">
            <KpiCard
              icon={ClipboardPlus}
              tone="primary"
              label="Qabul qilindi"
              value={created.data?.today ?? null}
              unit="buyurtma"
              prev={created.data?.prev}
              detail="yangi buyurtmalar"
            />
            <KpiCard
              icon={Factory}
              tone="violet"
              label="Sexga keldi"
              value={data.intake.orderCount}
              unit="buyurtma"
              prev={prev?.intake.orderCount}
              detail={`${data.intake.itemCount} ta mahsulot`}
              totals={data.intake.totals}
              warning={data.intake.unmeasuredCount > 0 ? `${data.intake.unmeasuredCount} ta o'lchanmagan` : null}
              onOpen={() => setDrawer('intake')}
            />
            <KpiCard
              icon={Droplets}
              tone="info"
              label="Yuvildi"
              value={data.washed.count}
              unit="mahsulot"
              prev={prev?.washed.count}
              detail={`${data.washed.orderCount} ta buyurtmadan`}
              totals={data.washed.totals}
              onOpen={() => setDrawer('washed')}
            />
            <KpiCard
              icon={PackageCheck}
              tone="warning"
              label="Upakovka"
              value={data.packed.count}
              unit="mahsulot"
              prev={prev?.packed.count}
              detail={`${data.packed.orderCount} ta buyurtmadan`}
              totals={data.packed.totals}
              onOpen={() => setDrawer('packed')}
            />
            <KpiCard
              icon={Truck}
              tone="success"
              label="Yetkazildi"
              value={data.delivered.orderCount}
              unit="buyurtma"
              prev={prev?.delivered.orderCount}
              detail={`${data.delivered.count} ta mahsulot`}
              money={data.delivered.deliveredAmount}
              totals={data.delivered.totals}
              onOpen={() => setDrawer('delivered')}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <CashPanel date={date} report={data} />

          {!data.hasActivityLog && !data.isToday && (
            <p className="flex items-start gap-2 rounded-xl bg-bg px-3 py-2.5 text-xs text-gray-dark">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              Bu kunda yuvish, upakovka va yetkazish yozuvi yo'q — kun tinch o'tgan yoki kunlik jurnal joriy etilishidan oldingi
              kun bo'lishi mumkin. "Sexga keldi" har ikkala holatda ham to'g'ri.
            </p>
          )}
        </div>
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
      {receiptOpen && <DailyReceiptDialog date={date} onClose={() => setReceiptOpen(false)} />}
    </Panel>
  )
}

const TONES = {
  primary: 'bg-brand-primary/10 text-brand-primary',
  violet: 'bg-[#f1e9f8] text-brand-secondary',
  info: 'bg-info-bg text-info',
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
} as const

/**
 * Bitta ko'rsatkich: katta son (nechta), kechagi kun bilan farq, birlik
 * bo'yicha hajm (har biri alohida "chip"da — m², metr, kg va dona bir-biriga
 * qo'shilmaydi) va ixtiyoriy tafsilot. Bosilsa batafsil ro'yxat ochiladi.
 */
function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  prev,
  detail,
  totals,
  warning,
  money,
  onOpen,
  className,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  value: number | null
  unit: string
  prev?: number | null
  detail?: string
  totals?: UnitTotal[]
  warning?: string | null
  /** Pul summasi — alohida qatorda (yetkazishda). */
  money?: number
  onOpen?: () => void
  className?: string
}) {
  const empty = value === 0
  const body: ReactNode = (
    <>
      <div className="flex items-center gap-2">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
          <Icon size={16} />
        </div>
        <span className="min-w-0 text-[13px] font-bold leading-tight text-ink">{label}</span>
        {onOpen && (
          <ChevronRight size={15} className="ml-auto hidden shrink-0 text-gray transition-transform group-hover:translate-x-0.5 sm:block" />
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn('font-heading text-[28px] font-extrabold leading-none tabular-nums', empty ? 'text-gray' : 'text-ink')}>
          {value ?? '—'}
        </span>
        <span className="text-xs font-semibold text-gray-dark">{unit}</span>
      </div>
      <Delta value={value} prev={prev} />

      {totals && totals.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {totals.map((t) => (
            <span key={t.unit} className="inline-flex items-baseline gap-0.5 rounded-lg bg-bg px-1.5 py-0.5">
              <span className="text-[13px] font-extrabold tabular-nums text-ink">{formatQty(t.amount, t.unit)}</span>
              <span className="text-[11px] font-semibold text-gray-dark">{t.label}</span>
            </span>
          ))}
        </div>
      )}

      {!empty && money !== undefined && (
        <div className="mt-2 truncate font-heading text-sm font-extrabold tabular-nums text-success" title={formatMoney(money)}>
          {formatMoney(money)}
        </div>
      )}

      {(detail || warning) && (
        <div className="mt-auto pt-2">
          {detail && <div className="line-clamp-2 text-[11.5px] leading-snug text-gray-dark">{empty ? "Bu kunda yozuv yo'q" : detail}</div>}
          {warning && <div className="line-clamp-2 text-[11.5px] font-bold leading-snug text-danger">{warning}</div>}
        </div>
      )}
    </>
  )

  const base = cn('group flex min-h-[150px] flex-col rounded-2xl border border-border bg-surface p-3 text-left sm:p-3.5', className)
  if (!onOpen || empty) return <div className={base}>{body}</div>
  return (
    <button onClick={onOpen} className={cn(base, 'transition-all hover:border-brand-primary/40 hover:shadow-md')}>
      {body}
    </button>
  )
}

/** Kechagi kun bilan farq: "▲ 3 kechagidan" / "kechagidek". */
function Delta({ value, prev }: { value: number | null; prev?: number | null }) {
  if (value === null || prev === undefined || prev === null) return <div className="h-4" />
  const diff = value - prev
  if (diff === 0) return <div className="mt-0.5 h-4 text-[11px] font-semibold text-gray-dark">kechagidek</div>
  const up = diff > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <div className={cn('mt-0.5 flex h-4 items-center gap-0.5 text-[11px] font-bold', up ? 'text-success' : 'text-gray-dark')}>
      <Icon size={13} />
      {Math.abs(diff)} <span className="font-semibold text-gray-dark">kechagidan {up ? "ko'p" : 'kam'}</span>
    </div>
  )
}

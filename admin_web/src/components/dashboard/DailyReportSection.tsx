import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  CreditCard,
  HandCoins,
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
import { businessDateKey } from '@/lib/business-time'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import {
  fetchDailyReport,
  runDailyActivityBackfill,
  setCashHandover,
  formatMoney,
  type DailyReport,
  type UnitTotal,
} from '@/lib/daily-report'
import { UnitTotals } from './UnitTotals'
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
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayKey)
  const [drawer, setDrawer] = useState<DrawerKind | null>(null)

  // Kunlik jurnal 2026-09-05 da joriy etilgan — undan oldingi kunlar
  // uchun u bo'sh. Bu migratsiya mahsulotlardagi mavjud vaqt
  // shtamplaridan (washedAt/qcAt/deliveredAt) jurnalni to'ldiradi.
  // Server bir marta bajarilganini belgilab qo'yadi, keyingi
  // ochilishlarda darhol "skipped" qaytaradi.
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
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
            <MetricCard
              icon={Factory}
              tone="primary"
              label="Sexga keldi"
              count={data.intake.orderCount}
              countLabel="buyurtma"
              detail={`${data.intake.itemCount} ta mahsulot`}
              totals={data.intake.totals}
              warning={data.intake.unmeasuredCount > 0 ? `${data.intake.unmeasuredCount} ta hali o'lchanmagan` : null}
              onView={() => setDrawer('intake')}
            />
            <MetricCard
              icon={Droplets}
              tone="info"
              label="Yuvildi"
              count={data.washed.count}
              countLabel="mahsulot"
              detail={`${data.washed.orderCount} ta buyurtma`}
              totals={data.washed.totals}
              onView={() => setDrawer('washed')}
            />
            <MetricCard
              icon={PackageCheck}
              tone="warning"
              label="Upakovka qilindi"
              count={data.packed.count}
              countLabel="mahsulot"
              detail={`${data.packed.orderCount} ta buyurtma`}
              totals={data.packed.totals}
              onView={() => setDrawer('packed')}
            />
            <MetricCard
              icon={Truck}
              tone="success"
              label="Yetkazildi"
              count={data.delivered.orderCount}
              countLabel="buyurtma"
              detail={`${data.delivered.count} ta mahsulot · ${formatMoney(data.delivered.deliveredAmount)}`}
              totals={data.delivered.totals}
              money={{ cash: data.delivered.cashAmount, card: data.delivered.cardAmount }}
              onView={() => setDrawer('delivered')}
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

/**
 * Bitta ko'rsatkich. Barcha kartalarda ierarxiya bir xil: katta son —
 * nechta, ostida hajm/summa tafsiloti. Avval kartaning eng katta matni
 * ba'zisida hajm, ba'zisida buyurtma soni edi va kartalarni bir-biriga
 * taqqoslab bo'lmasdi.
 */
function MetricCard({
  icon: Icon,
  tone,
  label,
  count,
  countLabel,
  detail,
  totals,
  money,
  warning,
  onView,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  count: number
  countLabel: string
  detail: string
  /** Birlik bo'yicha hajmlar — har biri ALOHIDA QATORDA ko'rsatiladi. */
  totals: UnitTotal[]
  /** Pul qanday olingani — faqat yetkazish kartasida mazmunli. */
  money?: { cash: number; card: number }
  warning?: string | null
  onView: () => void
}) {
  const empty = count === 0
  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors ${TONES[tone].ring}`}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone].icon}`}>
          <Icon size={17} />
        </div>
        <span className="truncate text-sm font-bold text-ink">{label}</span>
      </div>

      <div className="mt-3 min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`font-heading text-3xl font-extrabold leading-none ${empty ? 'text-gray' : 'text-ink'}`}>
            {count}
          </span>
          <span className="text-xs font-semibold text-gray-dark">ta {countLabel}</span>
        </div>
        <div className="mt-1.5 truncate text-xs text-gray-dark" title={detail}>
          {empty ? "Bu kunda yozuv yo'q" : detail}
        </div>
        {!empty && totals.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <UnitTotals totals={totals} size="sm" />
          </div>
        )}
        {!empty && money && (
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            <MoneyLine icon={Banknote} label="Naqd" amount={money.cash} />
            <MoneyLine icon={CreditCard} label="Karta" amount={money.card} />
          </div>
        )}
        {warning && <div className="mt-1.5 truncate text-xs font-bold text-danger">{warning}</div>}
      </div>

      <button
        onClick={onView}
        disabled={empty}
        className="mt-3.5 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-bg py-2 text-xs font-bold text-ink transition-colors hover:border-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-bg disabled:hover:text-ink"
      >
        <Eye size={14} />
        Ko'rish
      </button>
    </div>
  )
}

/**
 * Kichik pul qatori: belgi, nomi va summa. Naqd/karta ajratmasi hamma
 * joyda AYNAN shu ko'rinishda — kartada ham, dastavchik ro'yxatida ham.
 */
function MoneyLine({
  icon: Icon,
  label,
  amount,
  struck = false,
}: {
  icon: LucideIcon
  label: string
  amount: number
  struck?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon size={12} className={`shrink-0 ${struck ? 'text-success' : 'text-gray'}`} />
      <span className="text-gray-dark">{label}</span>
      <span className={`ml-auto whitespace-nowrap font-bold ${struck ? 'text-success line-through' : 'text-ink'}`}>
        {formatMoney(amount)}
      </span>
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

  // Topshiriladigan narsa — faqat NAQD: karta puli to'g'ridan-to'g'ri
  // kompaniya hisobiga tushadi va dastavchik qo'lidan o'tmaydi.
  const pendingCash = useMemo(
    () => report.drivers.filter((d) => !d.handedOver).reduce((sum, d) => sum + d.cashAmount, 0),
    [report.drivers],
  )

  if (report.drivers.length === 0) return null

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      {/* Sarlavha va jami summa ALOHIDA qatorlarda: telefonda ular bitta
          qatorga sig'masdi va sarlavha ingichka ustunga siqilib, har bir
          so'zi alohida qatorga tushib ketardi. */}
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
          <Wallet size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">Dastavchiklar qo'lidagi pul</div>
          <div className="text-xs text-gray-dark">
            Shu kuni yetkazgani va yopgan qarzlari. Topshiriladigan — faqat naqd qismi.
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2 rounded-xl bg-bg px-3 py-2.5">
        <span className="text-xs font-semibold text-gray-dark">Topshirilmagan naqd</span>
        <span className="whitespace-nowrap font-heading text-base font-extrabold text-ink">
          {formatMoney(pendingCash)}
        </span>
      </div>

      {/* Har bir dastavchik: ism va summa bitta qatorda, tugma pastda.
          Avval uchalasi bitta o'ralaydigan qatorda edi va telefonda tugma
          goh ism, goh summa yoniga tushib, ro'yxat notekis chiqardi. */}
      <ul className="mt-2 divide-y divide-border">
        {report.drivers.map((d) => (
          <li key={d.employeeId} className="py-3 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{d.name}</div>
                <div className="text-xs text-gray-dark">
                  {d.orderCount} ta buyurtma · {d.itemCount} ta mahsulot
                </div>
              </div>
              <div className="shrink-0 whitespace-nowrap font-heading text-sm font-extrabold text-ink">
                {formatMoney(d.amount)}
              </div>
            </div>

            {/* Naqd va karta ALOHIDA qatorlarda: topshirish faqat naqdga
                tegishli, shuning uchun ular bitta summaga qo'shilmaydi. */}
            <div className="mt-2 space-y-1 rounded-xl bg-bg px-3 py-2">
              <MoneyLine icon={Banknote} label="Naqd" amount={d.cashAmount} struck={d.handedOver} />
              <MoneyLine icon={CreditCard} label="Karta" amount={d.cardAmount} />
              {d.settledAmount > 0 && (
                <MoneyLine icon={HandCoins} label="Shundan yopilgan qarz" amount={d.settledAmount} />
              )}
            </div>

            <button
              onClick={() =>
                mutation.mutate({ employeeId: d.employeeId, handedOver: !d.handedOver, amount: d.cashAmount })
              }
              disabled={mutation.isPending}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 sm:w-auto ${
                d.handedOver
                  ? 'border border-border bg-bg text-gray-dark hover:text-ink'
                  : 'bg-brand-primary text-white hover:opacity-90'
              }`}
            >
              {d.handedOver ? <Undo2 size={14} /> : <Check size={14} />}
              {d.handedOver ? 'Topshirishni bekor qilish' : 'Naqd pulni topshirdi'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

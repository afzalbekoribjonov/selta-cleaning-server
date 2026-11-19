import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Info, Package, RefreshCw, RotateCcw, Search, Sparkles, Users, Wallet } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'
import { isDateKey, monthOf, todayKey, type DateRange } from '@/lib/uz-dates'
import { countOf, fetchWorkPeriod, hasAnyWork, unitsText, type WorkEmployee, type WorkPeriod } from '@/lib/work-period'
import { useDepartmentLookup } from '@/hooks/useDepartmentLookup'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { KpiTile } from '@/components/ui/KpiTile'
import { Panel, Segmented } from '@/components/ui/Panel'
import { PeriodPicker } from '@/components/ui/PeriodPicker'
import { EmployeeWorkCard } from '@/components/payroll/EmployeeWorkCard'
import { ProductStatsPanel, RewashPanel } from '@/components/payroll/StatsPanels'
import { SalaryConfigDialog } from '@/components/employees/SalaryConfigDialog'

type Filter = 'all' | 'worked' | 'unset'

/**
 * Maosh va statistika — istalgan kun, oraliq yoki kalendar oyi uchun
 * avtomatik hisob ("Hisoblash" tugmasi yo'q): xodimlarning ishi mahsulot ×
 * tarif × hajm bilan, ishbay puli, oy tanlansa — oylik maosh (baza va
 * avanslar bilan). Manba: /adminWorkPeriod (kunlik jurnal, keshlangan).
 */
export default function PayrollPage() {
  const [params, setParams] = useSearchParams()
  const range = useMemo<DateRange>(() => {
    const today = todayKey()
    const from = params.get('from')
    const to = params.get('to')
    if (isDateKey(from) && isDateKey(to) && from <= to && to <= today) return { from, to }
    return { from: today, to: today }
  }, [params])
  const setRange = (r: DateRange) => setParams({ from: r.from, to: r.to }, { replace: true })

  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['workPeriod', range.from, range.to],
    queryFn: () => fetchWorkPeriod(range),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const refresh = useMutation({
    mutationFn: () => fetchWorkPeriod(range, true),
    onSuccess: (data) => queryClient.setQueryData(['workPeriod', range.from, range.to], data),
  })

  // Bir martalik, idempotent tuzatish: `doneAt` maydonidan oldingi joyida
  // yuvish buyurtmalari (server: /adminBackfillDoneAt).
  useEffect(() => {
    apiPost('/adminBackfillDoneAt', {}).catch(() => {})
  }, [])

  const [salaryFor, setSalaryFor] = useState<WorkEmployee | null>(null)
  const data = query.data
  const isMonth = monthOf(range) !== null
  const loadingNew = query.isFetching && query.isPlaceholderData

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Maosh va statistika</h1>
          <p className="mt-1 text-sm text-gray-dark">Xodimlar ishi, ishbay puli va mahsulotlar hajmi — avtomatik hisob</p>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <PeriodPicker value={range} onChange={setRange} maxDays={93} className="min-w-0" />
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || query.isFetching}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-gray-dark shadow-sm hover:text-brand-primary disabled:opacity-60"
            title="Qayta hisoblash"
            aria-label="Qayta hisoblash"
          >
            <RefreshCw size={16} className={cn((refresh.isPending || query.isFetching) && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed sm:text-[13px]',
          isMonth ? 'border-brand-primary/20 bg-brand-primary/5 text-ink' : 'border-border bg-surface text-gray-dark',
        )}
      >
        {isMonth ? <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-primary" /> : <Info size={15} className="mt-0.5 shrink-0" />}
        <p className="min-w-0">
          {isMonth ? (
            <>
              <b>Oylik hisob:</b> baza qo'shilgan, shu oy avanslari ayirilgan. Natija xodim profilidagi maosh tarixiga ham yoziladi.
            </>
          ) : (
            <>
              <b className="text-ink">Kun yoki oraliq:</b> faqat ishbay qism ko'rsatiladi. Baza va avanslar butun oy tanlanganda qo'shiladi.
            </>
          )}
          {data && (
            <span className="text-gray-dark">
              {' '}
              Yangilandi: {new Date(data.generatedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </p>
      </div>

      {query.isError && !data ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger-bg/50 px-4 py-10 text-center">
          <AlertTriangle className="text-danger" />
          <p className="text-sm font-bold text-ink">
            {query.error instanceof ApiError ? query.error.message : "Ma'lumotni yuklab bo'lmadi"}
          </p>
          <button onClick={() => query.refetch()} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-white">
            Qayta urinish
          </button>
        </div>
      ) : !data ? (
        <LoadingSkeleton />
      ) : (
        <div className={cn('space-y-5 transition-opacity sm:space-y-6', loadingNew && 'pointer-events-none opacity-50')}>
          <KpiRow data={data} isMonth={isMonth} />
          <EmployeesPanel data={data} isMonth={isMonth} onConfigureSalary={setSalaryFor} />
          <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ProductStatsPanel products={data.products} />
            <RewashPanel employees={data.employees} />
          </div>
        </div>
      )}

      {salaryFor && (
        <SalaryConfigDialog
          employeeId={salaryFor.id}
          employeeName={salaryFor.fullName}
          department={salaryFor.department}
          currentMethod={salaryFor.salary?.method}
          currentParams={salaryFor.salary?.params}
          onClose={() => setSalaryFor(null)}
        />
      )}
    </div>
  )
}

function KpiRow({ data, isMonth }: { data: WorkPeriod; isMonth: boolean }) {
  const totals = useMemo(() => {
    const washed = data.employees.flatMap((e) => e.work.washed)
    const packed = data.employees.flatMap((e) => e.work.packed)
    const returned = data.employees.flatMap((e) => e.work.returned)
    const pay = data.employees.reduce((s, e) => s + (e.pay?.total ?? 0), 0)
    const unset = data.employees.filter((e) => !e.salary && e.status === 'active').length
    return { washed, packed, returned, pay, unset }
  }, [data])

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        icon={Wallet}
        label={isMonth ? 'Oylik maosh jami' : 'Ishbay jami'}
        value={<AnimatedNumber value={totals.pay} format={formatMoney} />}
        sub={totals.unset > 0 ? `${totals.unset} xodimda usul belgilanmagan` : 'Barcha xodimlarda usul bor'}
        subTone={totals.unset > 0 ? 'danger' : undefined}
      />
      <KpiTile icon={Sparkles} label="Yuvildi" value={`${countOf(totals.washed)} ta`} sub={unitsText(totals.washed) || '—'} tone="success" />
      <KpiTile icon={Package} label="Qadoqlandi" value={`${countOf(totals.packed)} ta`} sub={unitsText(totals.packed) || '—'} tone="info" />
      <KpiTile
        icon={RotateCcw}
        label="Qayta yuvishga"
        value={`${countOf(totals.returned)} ta`}
        sub={unitsText(totals.returned) || "Qaytgan yo'q"}
        tone={totals.returned.length ? 'danger' : 'muted'}
      />
    </div>
  )
}

function EmployeesPanel({
  data,
  isMonth,
  onConfigureSalary,
}: {
  data: WorkPeriod
  isMonth: boolean
  onConfigureSalary: (e: WorkEmployee) => void
}) {
  const { getDepartment } = useDepartmentLookup()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(
    () => ({
      all: data.employees.length,
      worked: data.employees.filter((e) => hasAnyWork(e.work)).length,
      unset: data.employees.filter((e) => !e.salary).length,
    }),
    [data],
  )

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    const list = data.employees.filter((e) => {
      if (filter === 'worked' && !hasAnyWork(e.work)) return false
      if (filter === 'unset' && e.salary) return false
      if (!q) return true
      return e.fullName.toLowerCase().includes(q) || (digits.length >= 3 && e.phone.replace(/\D/g, '').includes(digits))
    })
    // Server tartibi: bo'lim (ishchi, sotuv menejeri, dastavchik, nazoratchi, boshqa), so'ng ism.
    const map = new Map<string, WorkEmployee[]>()
    for (const e of list) map.set(e.department, [...(map.get(e.department) ?? []), e])
    return [...map.entries()].map(([dept, employees]) => ({
      dept,
      employees,
      pay: employees.reduce((s, e) => s + (e.pay?.total ?? 0), 0),
    }))
  }, [data, search, filter])

  return (
    <Panel
      title="Xodimlar"
      subtitle="Ism, telefon, kasbi va davrdagi ishi — batafsil uchun bosing"
      icon={Users}
      actions={
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Hammasi ${counts.all}` },
            { value: 'worked', label: `Ishlaganlar ${counts.worked}` },
            {
              value: 'unset',
              label: <span className={counts.unset ? 'text-danger' : undefined}>Belgilanmagan {counts.unset}</span>,
            },
          ]}
        />
      }
    >
      <label className="relative mb-4 block">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dark" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ism yoki telefon bo'yicha qidirish"
          className="h-11 w-full rounded-xl border border-border bg-bg pl-10 pr-4 text-sm outline-none focus:border-brand-primary"
        />
      </label>

      {groups.length === 0 ? (
        <p className="rounded-xl bg-bg py-10 text-center text-sm text-gray-dark">Mos xodim topilmadi</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const dept = getDepartment(g.dept)
            const Icon = dept.icon
            return (
              <section key={g.dept}>
                <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-ink">
                    <Icon size={15} className="shrink-0 text-brand-primary" />
                    <span className="truncate">{dept.label}</span>
                    <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold text-gray-dark">{g.employees.length}</span>
                  </h3>
                  {g.pay !== 0 && <span className="shrink-0 text-xs font-bold text-gray-dark">{formatMoney(g.pay)}</span>}
                </div>
                <div className="space-y-2">
                  {g.employees.map((e) => (
                    <EmployeeWorkCard
                      key={e.id}
                      employee={e}
                      departmentLabel={dept.label}
                      isMonth={isMonth}
                      onConfigureSalary={onConfigureSalary}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-bg" />
        ))}
      </div>
    </div>
  )
}

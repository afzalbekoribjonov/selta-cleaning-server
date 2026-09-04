import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Wallet, TrendingUp } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { DEPARTMENTS } from '@/lib/departments'
import {
  DEPT_TABS,
  fetchEmployeeActivity,
  rangeDateKeys,
  sortedForDept,
  type ActivityRow,
  type DeptKey,
  type RangeKey,
} from '@/lib/employee-activity'
import { ReportTable, type ReportColumn } from '@/components/dashboard/ReportTable'
import { Spinner } from '@/components/ui/Spinner'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface PayrollResult {
  fullName: string
  department: string
  method: string
  amount: number
  breakdown: Record<string, number>
}

export default function PayrollPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [results, setResults] = useState<Record<string, PayrollResult> | null>(null)

  // Bir martalik, xavfsiz (idempotent) tuzatish — `doneAt` maydoni
  // qo'shilishidan oldingi onsite buyurtmalarni to'ldiradi (bug fix:
  // avval "updatedAt" ishlatilgani uchun keyingi tahrirlar oyni
  // noto'g'ri "ko'chirib" yuborishi mumkin edi).
  useEffect(() => {
    apiPost('/adminBackfillDoneAt', {}).catch(() => {})
  }, [])

  const mutation = useMutation({
    mutationFn: () => apiPost<{ yearMonth: string; results: Record<string, PayrollResult> }>('/computeMonthlyPayroll', { yearMonth }),
    onSuccess: (data) => setResults(data.results),
  })

  const totalAmount = results ? Object.values(results).reduce((s, r) => s + r.amount, 0) : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Maosh va statistika</h1>
        <p className="mt-1 text-sm text-gray-dark">Oylik maosh hisob-kitobi va xodimlar faolligi</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 sm:flex-none">
            <label className="mb-1.5 block text-sm font-semibold text-ink">Oy</label>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm outline-none focus:border-brand-primary sm:w-48"
            />
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            <Wallet size={16} />
            {mutation.isPending ? 'Hisoblanmoqda...' : 'Hisoblash'}
          </button>
          {mutation.isError && (
            <span className="text-sm font-semibold text-danger">
              {mutation.error instanceof ApiError ? mutation.error.message : 'Xatolik yuz berdi'}
            </span>
          )}
          {results && (
            <span className="w-full text-sm font-bold text-ink sm:ml-auto sm:w-auto">
              Jami: <span className="text-brand-primary">{formatMoney(totalAmount)}</span>
            </span>
          )}
        </div>
      </section>

      {results && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 className="font-heading font-bold text-ink">Hisoblangan maosh — {yearMonth}</h2>
          </div>
          {Object.keys(results).length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-dark">
              Hech bir xodimga maosh usuli belgilanmagan — Xodimlar sahifasida sozlang
            </p>
          ) : (
            <div className="px-4 py-3 sm:px-5">
              <ReportTable
                columns={payrollColumns}
                rows={Object.entries(results).map(([id, r]) => ({ id, ...r }))}
                rowKey={(r) => r.id}
                empty="Natija yo'q"
              />
            </div>
          )}
        </section>
      )}

      <MostActiveSection />
    </div>
  )
}

type PayrollRow = PayrollResult & { id: string }

const payrollColumns: ReportColumn<PayrollRow>[] = [
  { key: 'name', label: 'Xodim', mobile: 'title', render: (r) => <span className="font-semibold text-ink">{r.fullName}</span> },
  { key: 'dept', label: "Bo'lim", mobile: 'meta', render: (r) => DEPARTMENTS[r.department]?.label ?? r.department },
  { key: 'method', label: 'Usul', mobile: 'meta', render: (r) => SALARY_METHODS[r.method]?.label ?? r.method },
  {
    key: 'amount',
    label: 'Summa',
    align: 'right',
    mobile: 'value',
    render: (r) => {
      const advancesTotal = (r.breakdown?.advancesTotal as number | undefined) ?? 0
      const grossAmount = (r.breakdown?.grossAmount as number | undefined) ?? r.amount
      return (
        <>
          <div className={`font-bold ${r.amount < 0 ? 'text-danger' : 'text-brand-primary'}`}>{formatMoney(r.amount)}</div>
          {advancesTotal > 0 && (
            <div className="text-[11px] font-normal text-gray-dark">
              {formatMoney(grossAmount)} − avans {formatMoney(advancesTotal)}
            </div>
          )}
        </>
      )
    },
  },
]

const RANGE_TABS: { key: RangeKey; label: string }[] = [
  { key: 'day', label: 'Kunlik' },
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
]

/**
 * "Eng faol xodimlar" — bo'lim va davr bo'yicha filtrlanadigan to'liq
 * ko'rinish (Dashboard'dagi kartaning kengaytirilgani, bir xil manba:
 * /adminEmployeeActivity).
 */
function MostActiveSection() {
  const [dept, setDept] = useState<DeptKey>('delivery')
  const [range, setRange] = useState<RangeKey>('day')
  const { from, to } = useMemo(() => rangeDateKeys(range), [range])

  const activity = useQuery({
    queryKey: ['employeeActivity', from, to],
    queryFn: () => fetchEmployeeActivity(from, to),
    staleTime: 60_000,
  })

  const rows = useMemo(() => sortedForDept(activity.data?.rows ?? [], dept), [activity.data, dept])

  const columns: ReportColumn<ActivityRow>[] = useMemo(() => {
    const name: ReportColumn<ActivityRow> = {
      key: 'name',
      label: 'Xodim',
      mobile: 'title',
      render: (r) => <span className="font-semibold text-ink">{r.name}</span>,
    }
    if (dept === 'delivery') {
      return [
        name,
        {
          key: 'pickedUp',
          label: 'Sexga olib keldi',
          align: 'right',
          mobile: 'meta',
          render: (r) => (
            <span className="text-ink">
              {r.pickedUpCount} ta <span className="text-xs text-gray-dark">({formatMoney(r.pickedUpTotal)})</span>
            </span>
          ),
        },
        {
          key: 'delivered',
          label: 'Yetkazdi',
          align: 'right',
          mobile: 'meta',
          render: (r) => (
            <span className="text-ink">
              {r.deliveredCount} ta <span className="text-xs text-gray-dark">({formatMoney(r.deliveredTotal)})</span>
            </span>
          ),
        },
      ]
    }
    if (dept === 'worker') {
      return [
        name,
        { key: 'washed', label: 'Yuvgan', align: 'right', mobile: 'meta', render: (r) => `${r.washedCount} ta` },
        { key: 'packed', label: 'Upakovka qilgan', align: 'right', mobile: 'meta', render: (r) => `${r.packedCount} ta` },
      ]
    }
    return [
      name,
      { key: 'orders', label: 'Buyurtmalar', align: 'right', mobile: 'meta', render: (r) => `${r.ordersCreated} ta` },
      {
        key: 'total',
        label: 'Summa',
        align: 'right',
        mobile: 'value',
        render: (r) => <span className="font-bold text-brand-primary">{formatMoney(r.ordersCreatedTotal)}</span>,
      },
    ]
  }, [dept])

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="shrink-0 text-brand-primary" />
        <h2 className="min-w-0 truncate font-heading font-bold text-ink">Eng faol xodimlar</h2>
      </div>

      {/* Tablar ataylab alohida qatorlarda va `flex-1` bilan: sarlavha
          bilan bir qatorda turganda ular torayishga qarshilik qilib,
          telefonda sahifani gorizontal cho'zib yuborardi. */}
      <div className="mt-3 flex rounded-xl border border-border bg-bg p-1">
        {RANGE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setRange(t.key)}
            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
              range === t.key ? 'bg-brand-primary text-white' : 'text-ink/70 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {DEPT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setDept(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              dept === t.key ? 'bg-brand-primary text-white' : 'bg-bg text-ink/70 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {activity.isLoading ? (
          <Spinner className="py-8" />
        ) : activity.isError ? (
          <p className="py-8 text-center text-sm text-danger">Faollikni yuklab bo'lmadi</p>
        ) : (
          <ReportTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.employeeId}
            empty="Bu davrda faollik yo'q"
          />
        )}
      </div>
    </section>
  )
}

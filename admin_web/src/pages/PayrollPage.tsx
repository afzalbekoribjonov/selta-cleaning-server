import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Wallet, TrendingUp } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { DEPARTMENTS } from '@/lib/departments'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { useAllOrderItems } from '@/hooks/useAllOrderItems'
import { computeEmployeeActivity, rangeStart, type ActivityRow, type RangeKey } from '@/lib/employee-activity'
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

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Oy</label>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
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
            <span className="ml-auto text-sm font-bold text-ink">
              Jami: <span className="text-brand-primary">{formatMoney(totalAmount)}</span>
            </span>
          )}
        </div>
      </section>

      {results && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading font-bold text-ink">Hisoblangan maosh — {yearMonth}</h2>
          </div>
          {Object.keys(results).length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-dark">
              Hech bir xodimga maosh usuli belgilanmagan — Xodimlar sahifasida sozlang
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-gray-dark">
                    <th className="px-5 py-3 font-semibold">Xodim</th>
                    <th className="px-5 py-3 font-semibold">Bo'lim</th>
                    <th className="px-5 py-3 font-semibold">Usul</th>
                    <th className="px-5 py-3 font-semibold text-right">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(results).map(([id, r]) => {
                    const advancesTotal = (r.breakdown?.advancesTotal as number | undefined) ?? 0
                    const grossAmount = (r.breakdown?.grossAmount as number | undefined) ?? r.amount
                    return (
                      <tr key={id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 font-semibold text-ink">{r.fullName}</td>
                        <td className="px-5 py-3 text-ink">{DEPARTMENTS[r.department]?.label ?? r.department}</td>
                        <td className="px-5 py-3 text-ink">{SALARY_METHODS[r.method]?.label ?? r.method}</td>
                        <td className="px-5 py-3 text-right">
                          <div className={`font-bold ${r.amount < 0 ? 'text-danger' : 'text-brand-primary'}`}>{formatMoney(r.amount)}</div>
                          {advancesTotal > 0 && (
                            <div className="text-[11px] text-gray-dark">
                              {formatMoney(grossAmount)} − avans {formatMoney(advancesTotal)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <MostActiveSection />
    </div>
  )
}

type DeptTab = 'delivery' | 'worker' | 'dispatcher'
const DEPT_TABS: { key: DeptTab; label: string }[] = [
  { key: 'delivery', label: 'Dastavchik' },
  { key: 'worker', label: 'Ishchi' },
  { key: 'dispatcher', label: 'Sotuv menejeri' },
]
const RANGE_TABS: { key: RangeKey; label: string }[] = [
  { key: 'day', label: 'Kunlik' },
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
]

function primaryMetric(dept: DeptTab, r: ActivityRow): number {
  if (dept === 'delivery') return r.pickedUpCount + r.deliveredCount
  if (dept === 'worker') return r.washedCount + r.qcCount
  return r.ordersCreated
}

/**
 * Talab: "Eng faol xodimlar" — bo'lim va davr (kunlik/haftalik/oylik)
 * bo'yicha filtrlanadigan to'liq ko'rinish. Dashboard'dagi EmployeeActivityChart
 * bilan bir xil hisoblash manbasi (computeEmployeeActivity) — faqat u
 * yerda faqat "kunlik" ko'rsatiladi, bu yerda hammasi.
 */
function MostActiveSection() {
  const [dept, setDept] = useState<DeptTab>('delivery')
  const [range, setRange] = useState<RangeKey>('day')
  const { orders, loading } = useRecentOrders()
  const employees = useEmployeesMap()

  const pickupOrderIds = useMemo(() => (orders ?? []).filter((o) => o.serviceType === 'pickup').map((o) => o.id), [orders])
  const itemsByOrder = useAllOrderItems(pickupOrderIds)

  const rows = useMemo(() => {
    const start = rangeStart(range)
    const end = new Date()
    end.setDate(end.getDate() + 1)
    const activity = computeEmployeeActivity(orders ?? [], itemsByOrder, employees, start, end)
    return Object.values(activity)
      .filter((r) => primaryMetric(dept, r) > 0)
      .sort((a, b) => primaryMetric(dept, b) - primaryMetric(dept, a))
  }, [orders, itemsByOrder, employees, dept, range])

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Eng faol xodimlar</h2>
        </div>
        <div className="flex rounded-xl border border-border bg-bg p-1">
          {RANGE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRange(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                range === t.key ? 'bg-brand-primary text-white' : 'text-ink/70 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex gap-2">
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

      {loading ? (
        <Spinner className="py-8" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-dark">Bu davrda faollik yo'q</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-gray-dark">
                <th className="px-3 py-2 font-semibold">Xodim</th>
                {dept === 'delivery' && (
                  <>
                    <th className="px-3 py-2 text-right font-semibold">Sexga olib keldi</th>
                    <th className="px-3 py-2 text-right font-semibold">Yetgazdi</th>
                  </>
                )}
                {dept === 'worker' && (
                  <>
                    <th className="px-3 py-2 text-right font-semibold">Yuvgan</th>
                    <th className="px-3 py-2 text-right font-semibold">Ishlov bergan (upakovka)</th>
                  </>
                )}
                {dept === 'dispatcher' && (
                  <>
                    <th className="px-3 py-2 text-right font-semibold">Buyurtmalar</th>
                    <th className="px-3 py-2 text-right font-semibold">Summa</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-ink">{r.name}</td>
                  {dept === 'delivery' && (
                    <>
                      <td className="px-3 py-2.5 text-right text-ink">
                        {r.pickedUpCount} ta <span className="text-xs text-gray-dark">({formatMoney(r.pickedUpTotal)})</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink">
                        {r.deliveredCount} ta <span className="text-xs text-gray-dark">({formatMoney(r.deliveredTotal)})</span>
                      </td>
                    </>
                  )}
                  {dept === 'worker' && (
                    <>
                      <td className="px-3 py-2.5 text-right font-bold text-ink">{r.washedCount} ta</td>
                      <td className="px-3 py-2.5 text-right font-bold text-ink">{r.qcCount} ta</td>
                    </>
                  )}
                  {dept === 'dispatcher' && (
                    <>
                      <td className="px-3 py-2.5 text-right font-bold text-ink">{r.ordersCreated} ta</td>
                      <td className="px-3 py-2.5 text-right font-bold text-brand-primary">{formatMoney(r.ordersCreatedTotal)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

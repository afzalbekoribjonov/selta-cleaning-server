import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Wallet, TrendingUp } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { DEPARTMENTS } from '@/lib/departments'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
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

function MostActiveSection() {
  const { orders, loading } = useRecentOrders()
  const employees = useEmployeesMap()

  const stats = useMemo(() => {
    const list = orders ?? []
    const count = (key: 'createdBy' | 'washedBy' | 'deliveredBy') => {
      const tally: Record<string, number> = {}
      for (const o of list) {
        const id = o[key]
        if (!id) continue
        tally[id] = (tally[id] ?? 0) + 1
      }
      return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5)
    }
    return {
      dispatcher: count('createdBy'),
      worker: count('washedBy'),
      delivery: count('deliveredBy'),
    }
  }, [orders])

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Eng faol xodimlar (so'nggi buyurtmalar bo'yicha)</h2>
      </div>
      {loading ? (
        <Spinner className="py-4" />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <ActivityColumn title="Dispetcher — buyurtma yaratgan" rows={stats.dispatcher} employees={employees} />
          <ActivityColumn title="Ishchi — yuvgan" rows={stats.worker} employees={employees} />
          <ActivityColumn title="Dastavchik — yetkazgan" rows={stats.delivery} employees={employees} />
        </div>
      )}
    </section>
  )
}

function ActivityColumn({
  title,
  rows,
  employees,
}: {
  title: string
  rows: [string, number][]
  employees: Record<string, string>
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-dark">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-dark">Ma'lumot yo'q</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map(([id, n], i) => (
            <li key={id} className="flex items-center justify-between text-sm">
              <span className="text-ink">
                {i + 1}. {employees[id] ?? "Noma'lum xodim"}
              </span>
              <span className="font-bold text-brand-primary">{n}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowRight } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { businessDateKey } from '@/lib/business-time'
import {
  DEPT_TABS,
  fetchEmployeeActivity,
  sortedForDept,
  type ActivityRow,
  type DeptKey,
} from '@/lib/employee-activity'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

/**
 * "Eng faol xodimlar" — Dashboard'da faqat BUGUNGI faollik, bo'lim
 * bo'yicha tab. Haftalik/oylik ko'rinish "Maosh va statistika"
 * sahifasida.
 *
 * Sarlavha va tablar ATAYLAB alohida qatorlarda: avval ular bitta
 * `justify-between` qatorda edi va tablar torayishga qarshilik
 * qilgani uchun telefonda butun sahifani gorizontal cho'zib yuborardi.
 */
export function EmployeeActivityChart() {
  const [tab, setTab] = useState<DeptKey>('delivery')
  const today = businessDateKey(new Date())

  const activity = useQuery({
    queryKey: ['employeeActivity', today, today],
    queryFn: () => fetchEmployeeActivity(today, today),
    staleTime: 60_000,
  })

  const rows = useMemo(() => sortedForDept(activity.data?.rows ?? [], tab), [activity.data, tab])

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <Activity size={18} className="shrink-0 text-brand-primary" />
        <h2 className="min-w-0 truncate font-heading font-bold text-ink">Eng faol xodimlar — bugun</h2>
      </div>
      <p className="mt-0.5 text-xs text-gray-dark">Bugungi kun bo'yicha</p>

      <div className="mt-3 flex rounded-xl border border-border bg-bg p-1">
        {DEPT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
              tab === t.key ? 'bg-brand-primary text-white' : 'text-ink/70 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Balandligi cheklangan: ro'yxat uzayganda karta o'z qatoridagi
          boshqa kartani ham cho'zib yuborardi va sahifa keraksiz uzayardi.
          Endi ro'yxatning o'zi aylanadi. */}
      <div className="mt-3 max-h-72 flex-1 overflow-y-auto">
        {activity.isLoading ? (
          <Spinner className="py-12" />
        ) : activity.isError ? (
          <p className="py-8 text-center text-sm text-danger">Faollikni yuklab bo'lmadi</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-dark">Bugun hali faollik yo'q</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <ActivityListRow key={r.employeeId} row={r} dept={tab} />
            ))}
          </ul>
        )}
      </div>

      <Link
        to="/payroll"
        className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
      >
        Haftalik/oylik statistikani ko'rish
        <ArrowRight size={13} />
      </Link>
    </section>
  )
}

/** Bitta xodim qatori — ism chapda, ko'rsatkichlar o'ngda, nomlangan. */
function ActivityListRow({ row, dept }: { row: ActivityRow; dept: DeptKey }) {
  const metrics: { label: string; value: string; note?: string }[] =
    dept === 'delivery'
      ? [
          { label: 'Sexga olib keldi', value: `${row.pickedUpCount} ta`, note: formatMoney(row.pickedUpTotal) },
          { label: 'Yetkazdi', value: `${row.deliveredCount} ta`, note: formatMoney(row.deliveredTotal) },
        ]
      : dept === 'worker'
        ? [
            { label: 'Yuvgan', value: `${row.washedCount} ta` },
            { label: 'Upakovka qilgan', value: `${row.packedCount} ta` },
          ]
        : [{ label: 'Buyurtma', value: `${row.ordersCreated} ta`, note: formatMoney(row.ordersCreatedTotal) }]

  return (
    <li className="py-2.5 first:pt-0">
      <div className="truncate text-sm font-bold text-ink">{row.name}</div>
      <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-baseline gap-1">
            <dt className="text-gray">{m.label}:</dt>
            <dd className="font-bold text-ink">{m.value}</dd>
            {m.note && <dd className="text-gray-dark">({m.note})</dd>}
          </div>
        ))}
      </dl>
    </li>
  )
}

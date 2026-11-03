import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowRight } from 'lucide-react'
import { businessDateKey } from '@/lib/business-time'
import {
  DEPT_TABS,
  fetchEmployeeActivity,
  primaryMetric,
  sortedForDept,
  type ActivityRow,
  type DeptKey,
} from '@/lib/employee-activity'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Panel, Segmented } from '@/components/ui/Panel'

/**
 * "Eng faol xodimlar" — Dashboard'da faqat BUGUNGI faollik, bo'lim
 * bo'yicha tab. Haftalik/oylik ko'rinish "Maosh va statistika"
 * sahifasida.
 *
 * Ro'yxat balandligi cheklangan: uzun ro'yxat yonidagi kartani cho'zib,
 * sahifani keraksiz uzaytirmasin — ro'yxatning o'zi aylanadi.
 */
export function EmployeeActivityChart({ className }: { className?: string }) {
  const [tab, setTab] = useState<DeptKey>('delivery')
  const today = businessDateKey(new Date())

  const activity = useQuery({
    queryKey: ['employeeActivity', today, today],
    queryFn: () => fetchEmployeeActivity(today, today),
    staleTime: 60_000,
  })

  const rows = useMemo(() => sortedForDept(activity.data?.rows ?? [], tab), [activity.data, tab])
  const top = rows.length ? primaryMetric(tab, rows[0]) : 0

  return (
    <Panel
      className={cn('flex flex-col', className)}
      icon={Activity}
      title="Eng faol xodimlar"
      subtitle="Bugun, bo'limlar bo'yicha"
      bodyClassName="flex flex-1 flex-col"
    >
      <Segmented value={tab} onChange={setTab} options={DEPT_TABS.map((t) => ({ value: t.key, label: t.label }))} />

      <div className="mt-3 max-h-80 flex-1 overflow-y-auto">
        {activity.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-bg" />
            ))}
          </div>
        ) : activity.isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-semibold text-danger">Faollikni yuklab bo'lmadi</p>
            <button onClick={() => activity.refetch()} className="text-xs font-bold text-brand-primary hover:underline">
              Qayta urinish
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-dark">Bugun hali faollik yo'q</p>
        ) : (
          <ol className="divide-y divide-border">
            {rows.map((r, i) => (
              <ActivityListRow key={r.employeeId} row={r} dept={tab} rank={i + 1} share={top > 0 ? primaryMetric(tab, r) / top : 0} />
            ))}
          </ol>
        )}
      </div>

      <Link
        to="/payroll"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold text-brand-primary hover:bg-brand-primary/5"
      >
        Haftalik/oylik statistikani ko'rish
        <ArrowRight size={13} />
      </Link>
    </Panel>
  )
}

/** Bitta xodim qatori — o'rni, ismi, nomlangan ko'rsatkichlar va eng faolga nisbatan chiziq. */
function ActivityListRow({ row, dept, rank, share }: { row: ActivityRow; dept: DeptKey; rank: number; share: number }) {
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
    <li className="flex gap-3 py-2.5 first:pt-0.5">
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums',
          rank === 1 ? 'bg-brand-accent text-ink' : 'bg-bg text-gray-dark',
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold leading-snug text-ink [overflow-wrap:anywhere]">{row.name}</div>
        <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-wrap items-baseline gap-x-1">
              <dt className="text-gray">{m.label}:</dt>
              <dd className="font-bold text-ink">{m.value}</dd>
              {m.note && <dd className="text-gray-dark">({m.note})</dd>}
            </div>
          ))}
        </dl>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-brand-primary/70" style={{ width: `${Math.max(4, share * 100)}%` }} />
        </div>
      </div>
    </li>
  )
}

import { useQuery } from '@tanstack/react-query'
import { CheckCheck, EyeOff, Megaphone } from 'lucide-react'
import { apiPost } from '@/lib/api'
import { formatDateTimeUz } from '@/lib/date-utils'
import { Spinner } from '@/components/ui/Spinner'

interface WarningRow {
  id: string
  text: string
  createdByName: string
  createdAt: string | null
  ackAt: string | null
}

/**
 * Nazoratchi (yoki admin) bergan ogohlantirishlar — server:
 * routes/supervisor.ts `/employeeWarnings` (oxirgi 50 ta). Xodim ilovada
 * "Tanishdim" bosgani ham ko'rinadi.
 */
export function WarningsSection({ employeeId }: { employeeId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employeeWarnings', employeeId],
    queryFn: () => apiPost<{ warnings: WarningRow[] }>('/employeeWarnings', { employeeId }),
    staleTime: 60_000,
  })
  const warnings = data?.warnings ?? []
  const unseen = warnings.filter((w) => !w.ackAt).length

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <Megaphone size={18} className="text-danger" />
        <h2 className="font-heading font-bold text-ink">Ogohlantirishlar</h2>
        {unseen > 0 && (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-extrabold text-danger">{unseen} ta ko'rilmagan</span>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-dark">Nazoratchi bergan ogohlantirishlar va xodim ular bilan tanishgani</p>

      {isLoading ? (
        <Spinner className="py-8" />
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg p-3.5 text-sm">
          <span className="font-semibold text-danger">Yuklab bo'lmadi</span>
          <button type="button" onClick={() => refetch()} className="text-xs font-bold text-brand-primary hover:underline">
            Qayta urinish
          </button>
        </div>
      ) : warnings.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-dark">Ogohlantirish berilmagan</p>
      ) : (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div key={w.id} className="rounded-xl bg-bg p-3.5">
              <p className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{w.text}</p>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                <span className="text-gray-dark">
                  {w.createdByName || 'Nazoratchi'}
                  {w.createdAt && ` · ${formatDateTimeUz(new Date(w.createdAt))}`}
                </span>
                {w.ackAt ? (
                  <span className="inline-flex items-center gap-1 font-bold text-success">
                    <CheckCheck size={13} />
                    Tanishdi · {formatDateTimeUz(new Date(w.ackAt))}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-danger">
                    <EyeOff size={13} />
                    Hali ko'rmadi
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

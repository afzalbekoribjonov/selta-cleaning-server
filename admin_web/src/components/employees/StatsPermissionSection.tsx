import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart3, ShieldCheck, ShieldOff } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { type Employee } from '@/lib/employees'

/**
 * "Kunlik ko'rsatkichlar" panelini ko'rish huquqi — talab: xodimga vakolat
 * berish orqali u ilovada bugungi sex/yuvish/yetkazish ko'rsatkichlarini,
 * dastavchiklar topshirishi kerak bo'lgan summani va joriy holatni ko'ra
 * oladi. Server (stats.ts: employeeDailyStats) shu bayroqni qayta
 * tekshiradi — bu yerdagisi faqat boshqaruv uchun.
 */
export function StatsPermissionSection({ employee }: { employee: Employee }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const terminated = employee.status !== 'active'
  const enabled = employee.canViewStats

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-brand-primary" />
          <div>
            <h2 className="font-heading font-bold text-ink">Kunlik ko'rsatkichlarni ko'rish</h2>
            <p className="mt-0.5 text-xs text-gray-dark">
              Ilovada bugungi sexga kelgan/yuvilgan/yetkazilgan buyurtmalar va yig'ilishi kerak bo'lgan summa
            </p>
          </div>
        </div>
        {!terminated &&
          (enabled ? (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-danger px-3 py-2 text-xs font-bold text-danger hover:bg-danger-bg"
            >
              <ShieldOff size={14} />
              Vakolatni olish
            </button>
          ) : (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
            >
              <ShieldCheck size={14} />
              Vakolat berish
            </button>
          ))}
      </div>

      {confirmOpen && <ConfirmDialog employee={employee} grant={!enabled} onClose={() => setConfirmOpen(false)} />}
    </section>
  )
}

function ConfirmDialog({ employee, grant, onClose }: { employee: Employee; grant: boolean; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetEmployeeStatsPermission', { employeeId: employee.id, canViewStats: grant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-ink">
          {grant ? <ShieldCheck size={18} className="text-brand-primary" /> : <ShieldOff size={18} className="text-danger" />}
          {grant ? 'Vakolat berish' : 'Vakolatni olish'}
        </h2>
        <p className="mt-2 text-sm text-gray-dark">
          {grant ? (
            <>
              <strong className="text-ink">{employee.fullName}</strong>ga kunlik ko'rsatkichlarni ko'rish huquqi
              berilsinmi? U ilovada bugungi statistikani va yig'ilishi kerak bo'lgan summani ko'ra oladi.
            </>
          ) : (
            <>
              <strong className="text-ink">{employee.fullName}</strong>dan kunlik ko'rsatkichlarni ko'rish huquqi olib
              qo'yilsinmi? Panel unga endi ko'rinmaydi.
            </>
          )}
        </p>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
            Bekor qilish
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60 ${grant ? 'bg-brand-primary' : 'bg-danger'}`}
          >
            {mutation.isPending ? '...' : 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

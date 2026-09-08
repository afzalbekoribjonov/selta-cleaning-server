import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HandCoins, ShieldCheck, ShieldOff } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { type Employee } from '@/lib/employees'

/**
 * "Qarz va chegirmalar" bo'limini ko'rish huquqi. Server
 * (routes/payments.ts: listPayments) shu bayroqni qayta tekshiradi —
 * bu yerdagisi faqat boshqaruv uchun. Standart holat `false`.
 */
export function FinancePermissionSection({ employee }: { employee: Employee }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const terminated = employee.status !== 'active'
  const enabled = employee.canViewFinance

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <HandCoins size={18} className="shrink-0 text-brand-primary" />
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-ink">Qarz va chegirmalarni ko'rish</h2>
            <p className="mt-0.5 text-xs text-gray-dark">
              Qarzdorlar, qisman to'lovlar va berilgan chegirmalar ro'yxati
            </p>
          </div>
        </div>
        {!terminated && (
          <button
            onClick={() => setConfirmOpen(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${
              enabled
                ? 'border border-danger text-danger hover:bg-danger-bg'
                : 'bg-brand-primary text-white shadow-sm'
            }`}
          >
            {enabled ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
            {enabled ? 'Vakolatni olish' : 'Vakolat berish'}
          </button>
        )}
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
    mutationFn: () => apiPost('/adminSetEmployeeFinancePermission', { employeeId: employee.id, canViewFinance: grant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-surface p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-lg font-extrabold text-ink">
          {grant ? 'Vakolat berilsinmi?' : 'Vakolat olinsinmi?'}
        </h3>
        <p className="mt-2 text-sm text-gray-dark">
          <strong className="text-ink">{employee.fullName}</strong>{' '}
          {grant
            ? "qarzdorlar, qisman to'lovlar va chegirmalar ro'yxatini ko'ra oladi."
            : "endi bu ma'lumotni ko'ra olmaydi."}
        </p>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-bold text-ink hover:bg-bg"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="h-11 flex-1 rounded-xl bg-brand-primary text-sm font-bold text-white disabled:opacity-60"
          >
            {mutation.isPending ? '...' : 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

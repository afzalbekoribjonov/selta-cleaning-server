import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Home, ShieldCheck, ShieldOff } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { type Employee } from '@/lib/employees'

/**
 * "Joyida yuvish" jamoasiga qo'shilish huquqi — talab: bu endi har qanday
 * ishchi/dastavchik emas, admin alohida ruxsat bergan xodimlargagina
 * tegishli. Sotuv menejeri (mobil/sotuv_web) jamoa biriktirishda ruxsati
 * yo'qlarni ro'yxatda ko'rsatadi, lekin qizil/bloklangan holatda —
 * server (assignTeam) shu bayroqni qayta tekshiradi.
 */
export function OnsiteWashingPermissionSection({ employee }: { employee: Employee }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const terminated = employee.status !== 'active'
  const enabled = employee.canDoOnsiteWashing

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Home size={18} className="text-brand-primary" />
          <div>
            <h2 className="font-heading font-bold text-ink">Joyida yuvish jamoasiga ruxsat</h2>
            <p className="mt-0.5 text-xs text-gray-dark">
              Sotuv menejeri joyida-yuvish buyurtmasiga jamoa biriktirganda, faqat ruxsati bor xodimlar tanlanadi
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

      {confirmOpen && (
        <ConfirmDialog employee={employee} grant={!enabled} onClose={() => setConfirmOpen(false)} />
      )}
    </section>
  )
}

function ConfirmDialog({
  employee,
  grant,
  onClose,
}: {
  employee: Employee
  grant: boolean
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetEmployeeOnsitePermission', { employeeId: employee.id, canDoOnsiteWashing: grant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="flex items-center gap-2 text-lg font-heading font-bold text-ink">
          {grant ? <ShieldCheck size={18} className="text-brand-primary" /> : <ShieldOff size={18} className="text-danger" />}
          {grant ? 'Vakolat berish' : 'Vakolatni olish'}
        </h2>
        <p className="mt-2 text-sm text-gray-dark">
          {grant ? (
            <>
              <strong className="text-ink">{employee.fullName}</strong>ga joyida yuvish jamoasiga qo'shilish huquqi
              berilsinmi? Sotuv menejeri endi uni jamoaga biriktira oladi.
            </>
          ) : (
            <>
              <strong className="text-ink">{employee.fullName}</strong>dan joyida yuvish jamoasiga qo'shilish huquqi
              olib qo'yilsinmi? Sotuv menejeri uni endi tanlay olmaydi.
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

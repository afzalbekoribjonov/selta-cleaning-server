import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Warehouse, Eye, EyeOff } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { type Employee } from '@/lib/employees'

/**
 * Ishchi bo'limidagi "sexga keladigan" (pickup) buyurtmalar navbatini
 * ko'rish/ko'rmaslik — talab: joyida-yuvishga ixtisoslashgan ishchilar
 * uchun bu navbat keraksiz bo'lishi mumkin, admin uni yashirishi mumkin
 * bo'lishi kerak. Standart holat — ko'rinadi (avvalgi xatti-harakat).
 */
export function WorkshopVisibilitySection({ employee }: { employee: Employee }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const terminated = employee.status !== 'active'
  const visible = employee.canSeeWorkshopQueue

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Warehouse size={18} className="text-brand-primary" />
          <div>
            <h2 className="font-heading font-bold text-ink">Sexga keladigan buyurtmalar navbati</h2>
            <p className="mt-0.5 text-xs text-gray-dark">
              {visible
                ? "Ilova/saytda ko'rinadi — xodim pickup buyurtmalar navbatini ko'radi va ishlov beradi"
                : "Yashirilgan — xodim faqat o'ziga biriktirilgan joyida-yuvish ishlarini ko'radi"}
            </p>
          </div>
        </div>
        {!terminated &&
          (visible ? (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-danger px-3 py-2 text-xs font-bold text-danger hover:bg-danger-bg"
            >
              <EyeOff size={14} />
              Yashirish
            </button>
          ) : (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
            >
              <Eye size={14} />
              Ko'rsatish
            </button>
          ))}
      </div>

      {confirmOpen && (
        <ConfirmDialog employee={employee} makeVisible={!visible} onClose={() => setConfirmOpen(false)} />
      )}
    </section>
  )
}

function ConfirmDialog({
  employee,
  makeVisible,
  onClose,
}: {
  employee: Employee
  makeVisible: boolean
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetEmployeeWorkshopVisibility', { employeeId: employee.id, canSeeWorkshopQueue: makeVisible }),
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
          {makeVisible ? <Eye size={18} className="text-brand-primary" /> : <EyeOff size={18} className="text-danger" />}
          {makeVisible ? "Navbatni ko'rsatish" : 'Navbatni yashirish'}
        </h2>
        <p className="mt-2 text-sm text-gray-dark">
          {makeVisible ? (
            <>
              <strong className="text-ink">{employee.fullName}</strong> endi sexga keladigan (pickup) buyurtmalar
              navbatini ko'radi.
            </>
          ) : (
            <>
              <strong className="text-ink">{employee.fullName}</strong>dan sexga keladigan buyurtmalar navbati
              yashirilsinmi? Faqat o'ziga biriktirilgan joyida-yuvish ishlarini ko'radi.
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
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60 ${makeVisible ? 'bg-brand-primary' : 'bg-danger'}`}
          >
            {mutation.isPending ? '...' : 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

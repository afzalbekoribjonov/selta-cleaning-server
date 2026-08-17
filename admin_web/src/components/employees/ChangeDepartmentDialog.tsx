import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Briefcase, AlertTriangle, ArrowRight } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useDepartmentLookup } from '@/hooks/useDepartmentLookup'
import { DepartmentSelectField, type DepartmentSelection } from './DepartmentSelectField'
import type { Employee } from '@/lib/employees'

/**
 * Xodim kasbini o'zgartirish — ikki bosqichli tasdiqlash bilan (talab:
 * "kasbini o'zgartirish ko'p tasdiqlashdan o'tgach"). 1-bosqich: yangi
 * kasb tanlanadi. 2-bosqich: oqibatlar ko'rsatiladi va admin xodimning
 * to'liq ismini yozib tasdiqlashi kerak — shundagina yakuniy tugma
 * faollashadi.
 */
export function ChangeDepartmentDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const { getDepartment } = useDepartmentLookup()
  const [step, setStep] = useState<1 | 2>(1)
  const [selection, setSelection] = useState<DepartmentSelection>({ department: employee.department })
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currentInfo = getDepartment(employee.department)
  const previewLabel = selection.newDepartment ? selection.newDepartment.label.trim() || '—' : getDepartment(selection.department ?? '').label

  const hasValidSelection = selection.newDepartment ? !!selection.newDepartment.label.trim() : !!selection.department
  const isUnchanged = selection.department === employee.department && !selection.newDepartment
  const nameMatches = confirmText.trim().toLowerCase() === employee.fullName.trim().toLowerCase()

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminChangeEmployeeDepartment', { employeeId: employee.id, ...selection }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-heading font-bold text-ink">
            <Briefcase size={18} className="text-brand-primary" />
            Kasbni o'zgartirish
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <p className="mb-5 text-sm text-gray-dark">
          <strong className="text-ink">{employee.fullName}</strong> — hozirgi kasbi: <strong className="text-ink">{currentInfo.label}</strong>
        </p>

        {step === 1 && (
          <div className="space-y-4">
            <DepartmentSelectField value={selection} onChange={setSelection} mode="change" excludeKey={employee.department} />
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
                Bekor qilish
              </button>
              <button
                onClick={() => {
                  setError(null)
                  if (!hasValidSelection) {
                    setError('Yangi kasbni tanlang yoki nomini yozing')
                    return
                  }
                  if (isUnchanged) {
                    setError('Bu xodim allaqachon shu kasbda ishlamoqda')
                    return
                  }
                  setStep(2)
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-primary py-2.5 text-sm font-bold text-white shadow-sm"
              >
                Davom etish
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 rounded-xl bg-bg p-4 text-center">
              <span className="text-sm font-bold text-gray-dark">{currentInfo.label}</span>
              <ArrowRight size={16} className="text-brand-primary" />
              <span className="text-sm font-extrabold text-brand-primary">{previewLabel}</span>
            </div>

            <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning-bg p-3.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-xs text-ink">
                Xodimning mobil ilovadagi joriy sessiyasi bekor qilinadi — u qayta PIN kiritib, yangi kasbiga mos panelga kiradi. Oldingi
                kasbi va o'zgarish sanasi xodim profilida saqlanib qoladi.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Tasdiqlash uchun xodimning to'liq ismini yozing: <span className="font-bold text-ink">{employee.fullName}</span>
              </label>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={employee.fullName}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>

            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
                Orqaga
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!nameMatches || mutation.isPending}
                className="flex-1 rounded-xl bg-brand-primary py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
              >
                {mutation.isPending ? '...' : 'Tasdiqlash'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

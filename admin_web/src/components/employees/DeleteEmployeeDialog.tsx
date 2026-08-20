import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Trash2 } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import type { Employee } from '@/lib/employees'

/**
 * Ishdan bo'shatilgan xodimni BUTUNLAY o'chirish — ikki bosqichli
 * tasdiqlash (boshqa qaytarib bo'lmaydigan amallar bilan bir xil naqsh:
 * TerminateDialog, DeleteOrderDialog). 1-bosqich: oqibat ogohlantiriladi.
 * 2-bosqich: admin xodimning to'liq ismini yozib tasdiqlaydi.
 */
export function DeleteEmployeeDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nameMatches = confirmText.trim().toLowerCase() === employee.fullName.trim().toLowerCase()

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminDeleteEmployee', { employeeId: employee.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <h2 className="flex items-center gap-2 text-lg font-heading font-bold text-ink">
          <Trash2 size={18} className="text-danger" />
          Xodimni butunlay o'chirish
        </h2>

        {step === 1 && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-gray-dark">
              <strong className="text-ink">{employee.fullName}</strong> tizimdan butunlay o'chirilsinmi? Bu amalni ortga
              qaytarib bo'lmaydi — xodimning barcha ma'lumotlari (maosh tarixi, avanslar, kasb tarixi) butunlay yo'qoladi.
              Buyurtmalardagi tarixiy yozuvlar (kim yaratgan/yuvgan va h.k.) saqlanib qoladi.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
                Bekor qilish
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger py-2.5 text-sm font-bold text-white"
              >
                Davom etish
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-3 space-y-4">
            <div className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger-bg p-3.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
              <p className="text-xs text-ink">Bu amal butunlay qaytarib bo'lmaydigan.</p>
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
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-danger"
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
                className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {mutation.isPending ? '...' : "O'chirish"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

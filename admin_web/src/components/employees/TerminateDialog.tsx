import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import type { Employee } from '@/lib/employees'

export function TerminateDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminTerminateEmployee', { employeeId: employee.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-heading font-bold text-ink">Ishdan bo'shatish</h2>
        <p className="mt-2 text-sm text-gray-dark">
          <strong className="text-ink">{employee.fullName}</strong> ishdan bo'shatilsinmi? Bu amalni ortga qaytarib bo'lmaydi — xodim
          tizimga kira olmay qoladi.
        </p>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
            Bekor qilish
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {mutation.isPending ? '...' : "Bo'shatish"}
          </button>
        </div>
      </div>
    </div>
  )
}

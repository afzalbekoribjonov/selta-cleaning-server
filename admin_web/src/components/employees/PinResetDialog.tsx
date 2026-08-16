import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'

export function PinResetDialog({
  employeeId,
  employeeName,
  onClose,
}: {
  employeeId: string
  employeeName: string
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetEmployeePin', { employeeId, newPin }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{4}$/.test(newPin)) {
      setError('PIN 4 ta raqamdan iborat bo\'lishi kerak')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">PIN o'zgartirish</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <p className="mb-5 text-sm text-gray-dark">{employeeName}</p>

        {done ? (
          <div className="text-center">
            <p className="mb-4 text-sm font-semibold text-success">PIN muvaffaqiyatli o'zgartirildi</p>
            <button onClick={onClose} className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white">
              Yopish
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="0000"
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-brand-primary"
            />
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
            >
              {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { SeltaLoader } from '@/components/SeltaLoader'

/**
 * Ilovadagi `showDialog` tasdiqlash oynasi bilan bir xil vazifa — talab:
 * "ko'p jarayonlarda xuddi ilovadagidek tasdiq oynalari". Mobil uchun
 * pastdan chiqadigan varaq ko'rinishida (barmoq bilan yetish oson), va
 * iPhone'ning pastki xavfsiz zonasi hisobga olingan.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Tasdiqlash',
  cancelLabel = 'Bekor qilish',
  danger = false,
  extra,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  extra?: ReactNode
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Oyna ochiq turganda orqa fon aylanmasin (iOS'da ayniqsa bezovta qiladi).
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, busy, onClose])

  if (!open) return null

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xatolik yuz berdi')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {danger && (
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-danger-bg">
            <AlertTriangle size={20} className="text-danger" />
          </div>
        )}
        <h2 className="font-heading text-lg font-extrabold text-ink">{title}</h2>
        {message && <div className="mt-2 text-sm leading-relaxed text-gray-dark">{message}</div>}
        {extra && <div className="mt-4">{extra}</div>}
        {error && <p className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-xs font-bold text-danger">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-12 flex-1 rounded-2xl border border-border text-sm font-bold text-ink active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={`flex h-12 flex-1 items-center justify-center rounded-2xl text-sm font-extrabold text-white active:scale-[0.98] disabled:opacity-60 ${
              danger ? 'bg-danger' : 'bg-brand-primary'
            }`}
          >
            {busy ? <SeltaLoader size={20} white /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

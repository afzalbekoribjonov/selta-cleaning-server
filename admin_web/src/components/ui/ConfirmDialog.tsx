import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

/** Tasdiqlash oynasi — `useConfirm()` orqali ishlatiladi (hooks/useConfirm.tsx). */
export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (value: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose(false)
      }
    }
    // Capture: ostidagi drawer/rasm ko'rinishi Escape'ni o'zi ushlab yopilmasin.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-0"
      onClick={(e) => {
        e.stopPropagation()
        onClose(false)
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {options.danger && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-title" className="font-heading text-base font-extrabold text-ink">
              {options.title}
            </h2>
            {options.message && <div className="mt-1.5 text-sm leading-relaxed text-gray-dark">{options.message}</div>}
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={() => onClose(false)}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-bold text-ink hover:bg-bg"
          >
            {options.cancelLabel ?? 'Bekor qilish'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={cn(
              'h-11 flex-1 rounded-xl text-sm font-bold text-white',
              options.danger ? 'bg-danger hover:opacity-90' : 'bg-brand-primary hover:opacity-90',
            )}
          >
            {options.confirmLabel ?? 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

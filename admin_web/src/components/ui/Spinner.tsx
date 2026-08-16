import { Loader2 } from 'lucide-react'

/** Butun panel bo'ylab bir xil ko'rinishdagi yuklanish holati. */
export function Spinner({ label = 'Yuklanmoqda...', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 text-sm text-gray-dark ${className}`}>
      <Loader2 size={16} className="animate-spin text-brand-primary" />
      {label}
    </div>
  )
}

/** Butun sahifani egallaydigan yuklanish holati — route Suspense fallback va auth gate uchun. */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <Spinner />
    </div>
  )
}

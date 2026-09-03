import { cn } from '@/lib/utils'

/**
 * Selta Cleaning logotipi aylanib turadigan yuklanish ko'rsatkichi —
 * mobile/lib/core/widgets/selta_loader.dart bilan bir xil g'oya
 * (talab: "loadinglarda ham Selta Cleaning logosi aylansin").
 */
export function SeltaLoader({
  size = 44,
  white = false,
  label,
  className,
}: {
  size?: number
  white?: boolean
  label?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <img
        src={white ? '/brand/icon_white.png' : '/brand/icon_purple.png'}
        alt=""
        width={size}
        height={size}
        className="animate-spin"
        style={{ animationDuration: '1.4s' }}
      />
      {label && (
        <p className={cn('mt-3.5 text-[13px] font-semibold', white ? 'text-white/85' : 'text-gray-dark')}>{label}</p>
      )}
    </div>
  )
}

/** Sahifa ichidagi yuklanish holati. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return <SeltaLoader size={34} label={label} className={cn('py-8', className)} />
}

/** To'liq ekranli yuklanish — ilova birinchi ochilganda. */
export function FullPageSpinner({ label = 'Yuklanmoqda...' }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg">
      <SeltaLoader label={label} />
    </div>
  )
}

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES = {
  primary: 'bg-brand-primary/10 text-brand-primary',
  success: 'bg-success-bg text-success',
  info: 'bg-info-bg text-info',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  muted: 'bg-bg text-gray-dark',
}

/**
 * Ko'rsatkich kartasi: belgi + nom, katta qiymat va ostida izoh. Qiymat
 * uzun bo'lsa (masalan "245,5 m² · 32 dona") qatorga bo'linadi, kesilmaydi.
 */
export function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'primary',
  subTone,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: keyof typeof TONES
  subTone?: 'danger' | 'warning'
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface p-3.5 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
          <Icon size={16} />
        </div>
        <span className="line-clamp-2 min-w-0 text-xs font-bold leading-tight text-gray-dark sm:text-sm">{label}</span>
      </div>
      <div className="mt-2 font-heading text-lg font-extrabold leading-tight text-ink [overflow-wrap:anywhere] sm:text-xl 2xl:text-2xl">{value}</div>
      {sub && (
        <div
          className={cn(
            'mt-0.5 text-[11px] font-semibold leading-snug sm:text-xs',
            subTone === 'danger' ? 'text-danger' : subTone === 'warning' ? 'text-warning' : 'text-gray-dark',
          )}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

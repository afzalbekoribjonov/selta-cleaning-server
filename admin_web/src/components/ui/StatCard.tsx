import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const toneClasses: Record<string, string> = {
    primary: 'bg-brand-primary/10 text-brand-primary',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    danger: 'bg-danger-bg text-danger',
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4 shadow-sm">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', toneClasses[tone])}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-heading font-extrabold text-ink leading-tight">{value}</div>
        <div className="text-sm text-gray-dark">{label}</div>
      </div>
    </div>
  )
}

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from './AnimatedNumber'

export function StatCard({
  icon: Icon,
  label,
  value,
  numericValue,
  format,
  tone = 'primary',
}: {
  icon: LucideIcon
  label: string
  /** Yuklanayotganda yoki animatsiya kerak bo'lmaganda — statik matn. */
  value?: string
  /** Berilsa, sonni oldingi qiymatdan silliq animatsiya bilan ko'rsatadi. */
  numericValue?: number
  format?: (n: number) => string
  tone?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const toneClasses: Record<string, string> = {
    primary: 'bg-brand-primary/10 text-brand-primary',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    danger: 'bg-danger-bg text-danger',
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', toneClasses[tone])}>
        <Icon size={20} />
      </div>
      {/* `min-w-0` — flex bolasi standart holatda o'z mazmuni kengligidan
          kichraya olmaydi, shuning uchun uzun matn (masalan "Belgilanmagan")
          tor mobil grid katakchasida kartani chetga chiqarib yuborardi. */}
      <div className="min-w-0">
        <div
          className="truncate text-2xl font-heading font-extrabold text-ink leading-tight"
          title={typeof value === 'string' ? value : undefined}
        >
          {numericValue != null ? <AnimatedNumber value={numericValue} format={format} /> : value}
        </div>
        <div className="truncate text-sm text-gray-dark">{label}</div>
      </div>
    </div>
  )
}

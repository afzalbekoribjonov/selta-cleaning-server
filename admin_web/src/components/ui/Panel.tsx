import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Sahifa bo'limi — barcha bo'limlar bir xil ko'rinishda: sarlavha, izoh,
 * o'ng tomonda amallar va mazmun.
 *
 * Har bir bo'lim o'z xatolik to'sig'iga ega: bitta grafik yoki ro'yxat
 * kutilmagan ma'lumotdan yiqilsa, butun sahifa emas, faqat o'sha bo'lim
 * "yuklab bo'lmadi" deb ko'rsatiladi va qolganlari ishlayveradi.
 */
export function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('min-w-0 rounded-2xl border border-border bg-surface shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {Icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                <Icon size={18} />
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-heading text-base font-extrabold leading-tight text-ink sm:text-lg">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs leading-snug text-gray-dark sm:text-[13px]">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('p-4 sm:p-5', title || actions ? 'pt-3 sm:pt-4' : '', bodyClassName)}>
        <SectionBoundary>{children}</SectionBoundary>
      </div>
    </section>
  )
}

interface BoundaryState {
  error: Error | null
}

/** Bo'lim darajasidagi xatolik to'sig'i — qolgan sahifa ishlayveradi. */
export class SectionBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Bo'limda xatolik:", error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-danger-bg/60 px-4 py-6 text-center">
        <AlertTriangle size={20} className="text-danger" />
        <p className="text-sm font-semibold text-ink">Bu bo'limni ko'rsatib bo'lmadi</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-brand-primary hover:bg-brand-primary/10"
        >
          <RotateCcw size={13} />
          Qayta urinish
        </button>
      </div>
    )
  }
}

/** Ichki segment tugmalari (14 kun / 30 kun va h.k.). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  size?: 'sm' | 'xs'
}) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-xl border border-border bg-bg p-0.5 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-lg font-bold transition-colors',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]',
            value === o.value ? 'bg-surface text-brand-primary shadow-sm' : 'text-gray-dark hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

import type { LucideIcon } from 'lucide-react'

export function PlaceholderPage({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon
  title: string
  description: string
  phase: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
          <Icon size={26} />
        </div>
        <h1 className="text-lg font-heading font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-gray-dark">{description}</p>
        <p className="mt-4 text-xs text-gray">{phase}</p>
      </div>
    </div>
  )
}

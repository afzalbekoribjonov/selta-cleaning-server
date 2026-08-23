import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-6', className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary/25 border-t-brand-primary" />
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-primary/20 border-t-brand-primary" />
    </div>
  )
}

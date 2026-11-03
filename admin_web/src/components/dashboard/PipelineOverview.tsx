import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CircleDashed,
  Droplets,
  House,
  PackageCheck,
  PackageOpen,
  Ruler,
  Sparkles,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { useActiveOrders } from '@/hooks/useRecentOrders'
import { isOrderOverdue } from '@/lib/order-tariffs'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'

interface Stage {
  key: string
  label: string
  hint: string
  value: number
  unit: 'buyurtma' | 'mahsulot'
  icon: LucideIcon
  tone: 'blue' | 'teal' | 'red' | 'gray' | 'violet' | 'amber' | 'green'
  to: string
  /** 0 bo'lsa ko'rsatilmaydi (masalan "Qaytarilgan"). */
  hideWhenZero?: boolean
}

const TONE: Record<Stage['tone'], string> = {
  blue: 'bg-info-bg text-info',
  teal: 'bg-[#e3f8f6] text-[#0e9488]',
  red: 'bg-danger-bg text-danger',
  gray: 'bg-bg text-gray-dark',
  violet: 'bg-[#f1e9f8] text-brand-secondary',
  amber: 'bg-warning-bg text-[#8a5a00]',
  green: 'bg-success-bg text-success',
}

/**
 * "Hozirgi holat" — barcha FAOL buyurtmalar qaysi bosqichda turgani, jonli.
 *
 * Olib kelish buyurtmasining o'zi butun umri "Sexga keldi"da turadi: haqiqiy
 * jarayon (o'lchash → yuvish → upakovka → tayyor) MAHSULOT darajasida. Shuning
 * uchun sex bosqichlari mahsulot sonida (buyurtmadagi `itemStatusCounts` —
 * qo'shimcha o'qishsiz), mijoz tomoni esa buyurtma sonida ko'rsatiladi.
 * Har bir bosqich bosilsa buyurtmalar ro'yxati shu filtr bilan ochiladi.
 */
export function PipelineOverview() {
  const { orders, loading } = useActiveOrders()

  const { stages, total } = useMemo(() => {
    const active = orders ?? []
    const pickup = active.filter((o) => o.serviceType === 'pickup')
    const sum = (status: string) => pickup.reduce((s, o) => s + (o.itemStatusCounts[status] ?? 0), 0)
    const unmeasured = pickup.reduce((s, o) => s + (o.zeroPriceItemCount ?? 0), 0)
    const list: Stage[] = [
      { key: 'new', label: 'Olib ketilmagan', hint: 'mijozdan', value: pickup.filter((o) => o.status === 'new').length, unit: 'buyurtma', icon: CircleDashed, tone: 'blue', to: '/orders?status=order:new&service=pickup' },
      { key: 'picked', label: "Yo'lda", hint: 'sexga kelmoqda', value: pickup.filter((o) => o.status === 'picked_up').length, unit: 'buyurtma', icon: Car, tone: 'teal', to: '/orders?status=order:picked_up' },
      { key: 'unmeasured', label: "O'lchanmagan", hint: 'narxi yo\'q', value: unmeasured, unit: 'mahsulot', icon: Ruler, tone: 'red', to: '/orders?unmeasured=1' },
      { key: 'pending', label: 'Yuvish navbatida', hint: "o'lchangan", value: Math.max(0, sum('pending') - unmeasured), unit: 'mahsulot', icon: PackageOpen, tone: 'gray', to: '/orders?status=item:pending' },
      { key: 'washing', label: 'Yuvilmoqda', hint: 'sexda', value: sum('washing'), unit: 'mahsulot', icon: Droplets, tone: 'blue', to: '/orders?status=item:washing' },
      { key: 'packing', label: 'Upakovkada', hint: 'sexda', value: sum('packing'), unit: 'mahsulot', icon: PackageCheck, tone: 'amber', to: '/orders?status=item:packing' },
      { key: 'returned', label: 'Qayta ishlovda', hint: 'sifatdan qaytgan', value: sum('returned'), unit: 'mahsulot', icon: Undo2, tone: 'red', to: '/orders?status=item:returned', hideWhenZero: true },
      { key: 'ready', label: 'Tayyor', hint: 'omborda, yetkazishga', value: sum('ready'), unit: 'mahsulot', icon: Sparkles, tone: 'green', to: '/orders?status=item:ready' },
      { key: 'onsite', label: 'Joyida yuvish', hint: 'faol ishlar', value: active.filter((o) => o.serviceType === 'onsite').length, unit: 'buyurtma', icon: House, tone: 'violet', to: '/orders?service=onsite' },
      { key: 'overdue', label: 'Kechikkan', hint: "muddati o'tgan", value: active.filter((o) => isOrderOverdue(o)).length, unit: 'buyurtma', icon: AlertTriangle, tone: 'red', to: '/orders?overdue=1' },
    ]
    return { stages: list.filter((s) => !(s.hideWhenZero && s.value === 0)), total: active.length }
  }, [orders])

  return (
    <Panel
      title="Hozirgi holat"
      subtitle={loading ? 'Jonli · yuklanmoqda…' : `Jonli · ${total} ta faol buyurtma`}
      actions={
        <Link to="/orders" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-brand-primary hover:bg-brand-primary/5">
          Buyurtmalar
          <ArrowRight size={14} />
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stages.map((s) =>
          loading ? (
            <div key={s.key} className="h-[86px] animate-pulse rounded-xl bg-bg" />
          ) : (
            <Link
              key={s.key}
              to={s.to}
              className={cn(
                'group flex min-w-0 items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 transition-all hover:border-brand-primary/40 hover:shadow-sm',
                s.value === 0 && 'opacity-60',
                (s.key === 'overdue' || s.key === 'unmeasured') && s.value > 0 && 'border-danger/30 bg-danger-bg/30',
              )}
            >
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE[s.tone])}>
                <s.icon size={17} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-1">
                  <span className="font-heading text-xl font-extrabold leading-tight tabular-nums text-ink">{s.value}</span>
                  <span className="text-[11px] font-semibold text-gray-dark">{s.unit}</span>
                </div>
                <div className="text-[12.5px] font-bold leading-snug text-ink">{s.label}</div>
                <div className="text-[11px] leading-snug text-gray-dark">{s.hint}</div>
              </div>
            </Link>
          ),
        )}
      </div>
    </Panel>
  )
}

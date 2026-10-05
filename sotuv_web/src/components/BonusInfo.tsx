import { useEffect, useState } from 'react'
import { Gift } from 'lucide-react'
import { apiPost } from '@/lib/api'
import { type Order } from '@/lib/orders'

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

interface CustomerBonus {
  balance: number
  earnedTotal: number
  spentTotal: number
}

/**
 * Mijoz bonusi (keshbek) — sotuv menejeri mijozga "bonusingiz bor" deb
 * aytishi uchun. Bonus to'lov paytida (ilovada) ishlatiladi; bu yerda
 * faqat ko'rinadi. Ko'rsatadigan narsa bo'lmasa chiqmaydi.
 */
export function BonusInfo({ order }: { order: Order }) {
  const [bonus, setBonus] = useState<CustomerBonus | null>(null)
  const phone = order.phone

  useEffect(() => {
    let alive = true
    if (phone.replace(/\D/g, '').length < 9) return
    apiPost<CustomerBonus>('/customerBonus', { phone })
      .then((b) => alive && setBonus(b))
      .catch(() => alive && setBonus(null))
    return () => {
      alive = false
    }
  }, [phone])

  const balance = bonus?.balance ?? 0
  const earned = order.bonusEarned ?? 0
  if (balance <= 0 && order.bonusAmount <= 0 && earned <= 0) return null

  return (
    <div className="rounded-2xl border border-brand-accent/50 bg-surface p-5">
      <div className="mb-2 flex items-center gap-2">
        <Gift size={16} className="text-warning" />
        <h3 className="text-sm font-extrabold text-ink">Bonus (keshbek)</h3>
      </div>
      {balance > 0 && <Line label="Mijoz hisobida" value={formatMoney(balance)} tone="text-warning" strong />}
      {order.bonusAmount > 0 && <Line label="Shu buyurtmada bonusdan ayirildi" value={`-${formatMoney(order.bonusAmount)}`} />}
      {earned > 0 && <Line label="Yakunda mijozga berildi" value={`+${formatMoney(earned)}`} tone="text-success" />}
    </div>
  )
}

function Line({ label, value, tone = 'text-ink', strong = false }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs font-semibold text-gray-dark">{label}</span>
      <span className={`whitespace-nowrap ${strong ? 'text-sm font-extrabold' : 'text-xs font-bold'} ${tone}`}>{value}</span>
    </div>
  )
}

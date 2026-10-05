import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { fetchCustomerBonus } from '@/lib/bonus'
import { type Order } from '@/lib/orders'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

/**
 * Bonus (keshbek): mijoz hisobidagi qoldiq, shu buyurtmaga qo'llangan
 * bonus va yakunda berilgan keshbek. Ko'rsatadigan narsa bo'lmasa
 * bo'lim chiqmaydi.
 */
export function BonusSection({ order }: { order: Order }) {
  const digits = order.phone.replace(/\D/g, '')
  const { data } = useQuery({
    queryKey: ['customerBonus', digits.slice(-9)],
    queryFn: () => fetchCustomerBonus(order.phone),
    enabled: digits.length >= 9,
    staleTime: 30_000,
  })

  const balance = data?.balance ?? 0
  const earned = order.bonusEarned ?? 0
  if (balance <= 0 && order.bonusAmount <= 0 && earned <= 0) return null

  return (
    <section className="rounded-2xl border border-brand-accent/50 bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gift size={16} className="text-warning" />
        <h3 className="text-sm font-extrabold text-ink">Bonus (keshbek)</h3>
      </div>
      {balance > 0 && <Line label="Mijoz hisobida" value={formatMoney(balance)} tone="text-warning" strong />}
      {order.bonusAmount > 0 && <Line label="Shu buyurtmada bonusdan ayirildi" value={`-${formatMoney(order.bonusAmount)}`} />}
      {earned > 0 && <Line label="Yakunda mijozga berildi" value={`+${formatMoney(earned)}`} tone="text-success" />}
      {data && data.earnedTotal > 0 && (
        <p className="mt-1 text-[11px] text-gray-dark">
          Jami olgan: {formatMoney(data.earnedTotal)} · ishlatgan: {formatMoney(data.spentTotal)}
        </p>
      )}
    </section>
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

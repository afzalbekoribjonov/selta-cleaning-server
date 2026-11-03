import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, HandCoins, Wallet, type LucideIcon } from 'lucide-react'
import { fetchPayments } from '@/lib/payments'
import { formatMoney } from '@/lib/units'
import { Panel } from '@/components/ui/Panel'

/**
 * Yopilmagan qarz va qisman to'lovlar — boshqaruv panelidagi qisqa
 * xulosa. To'liq ro'yxat "Qarz va chegirmalar" bo'limida.
 *
 * So'rov kaliti FinancePage bilan bir xil (`['payments','outstanding']`)
 * — ikkalasi bir xil ma'lumotdan foydalanadi va bo'limga o'tilganda
 * qayta so'ralmaydi.
 */
export function OutstandingCard({ className }: { className?: string }) {
  const query = useQuery({
    queryKey: ['payments', 'outstanding'],
    queryFn: () => fetchPayments({ scope: 'outstanding' }),
    staleTime: 30_000,
  })

  const totals = query.data?.totals
  const nothing = (totals?.debtCount ?? 0) === 0 && (totals?.partialCount ?? 0) === 0

  return (
    <Panel
      className={className}
      icon={HandCoins}
      title="Yopilmagan to'lovlar"
      subtitle="Mijozlardan hali olinmagan summa"
      actions={
        <Link to="/finance" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-brand-primary hover:bg-brand-primary/5">
          Barchasi
          <ArrowRight size={14} />
        </Link>
      }
    >
      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-bg" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm font-semibold text-danger">Yuklab bo'lmadi</p>
          <button onClick={() => query.refetch()} className="text-xs font-bold text-brand-primary hover:underline">
            Qayta urinish
          </button>
        </div>
      ) : nothing ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 size={26} className="text-success" />
          <p className="text-sm font-semibold text-ink">Yopilmagan to'lov yo'q</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl bg-danger-bg/50 px-3 py-2.5">
            <div className="text-[11px] font-semibold text-gray-dark">Jami olinmagan</div>
            <div className="font-heading text-lg font-extrabold tabular-nums text-danger">
              {formatMoney(totals!.debtAmount + totals!.partialAmount)}
            </div>
          </div>
          <Row icon={HandCoins} tone="text-danger" label="Qarz" count={totals!.debtCount} amount={totals!.debtAmount} />
          <Row icon={Wallet} tone="text-warning" label="Qisman to'langan" count={totals!.partialCount} amount={totals!.partialAmount} />
        </div>
      )}
    </Panel>
  )
}

function Row({ icon: Icon, tone, label, count, amount }: { icon: LucideIcon; tone: string; label: string; count: number; amount: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2.5">
      <Icon size={15} className={`shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{label}</div>
        <div className="text-xs text-gray-dark">{count} ta buyurtma</div>
      </div>
      <div className={`shrink-0 whitespace-nowrap font-heading text-sm font-extrabold tabular-nums ${tone}`}>{formatMoney(amount)}</div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HandCoins, Wallet, ArrowRight } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { fetchPayments } from '@/lib/payments'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

/**
 * Yopilmagan qarz va qisman to'lovlar — boshqaruv panelidagi qisqa
 * xulosa. To'liq ro'yxat "Qarz va chegirmalar" bo'limida.
 *
 * So'rov kaliti FinancePage bilan bir xil (`['payments','outstanding']`)
 * — ikkalasi bir xil ma'lumotdan foydalanadi va bo'limga o'tilganda
 * qayta so'ralmaydi.
 */
export function OutstandingCard() {
  const query = useQuery({
    queryKey: ['payments', 'outstanding'],
    queryFn: () => fetchPayments({ scope: 'outstanding' }),
    staleTime: 30_000,
  })

  const totals = query.data?.totals
  const nothing = (totals?.debtCount ?? 0) === 0 && (totals?.partialCount ?? 0) === 0

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <HandCoins size={18} className="shrink-0 text-brand-primary" />
        <h2 className="min-w-0 truncate font-heading font-bold text-ink">Yopilmagan to'lovlar</h2>
      </div>
      <p className="mt-0.5 text-xs text-gray-dark">Mijozdan hali olinmagan summa</p>

      {query.isLoading ? (
        <Spinner className="py-8" />
      ) : query.isError ? (
        <p className="py-6 text-center text-sm text-danger">Yuklab bo'lmadi</p>
      ) : nothing ? (
        <p className="py-6 text-center text-sm font-semibold text-gray-dark">Yopilmagan to'lov yo'q</p>
      ) : (
        <div className="mt-3 space-y-2">
          <Row
            icon={HandCoins}
            tone="text-danger"
            label="Qarz"
            count={totals!.debtCount}
            amount={totals!.debtAmount}
          />
          <Row
            icon={Wallet}
            tone="text-warning"
            label="Qisman to'lov"
            count={totals!.partialCount}
            amount={totals!.partialAmount}
          />
        </div>
      )}

      <Link
        to="/finance"
        className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-brand-primary hover:underline"
      >
        Barchasini ko'rish
        <ArrowRight size={13} />
      </Link>
    </section>
  )
}

function Row({
  icon: Icon,
  tone,
  label,
  count,
  amount,
}: {
  icon: typeof HandCoins
  tone: string
  label: string
  count: number
  amount: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2.5">
      <Icon size={15} className={`shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-ink">{label}</div>
        <div className="text-xs text-gray-dark">{count} ta</div>
      </div>
      <div className={`shrink-0 whitespace-nowrap font-heading text-sm font-extrabold ${tone}`}>
        {formatMoney(amount)}
      </div>
    </div>
  )
}

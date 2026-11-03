import { prepaidCredit, type Order } from '@/lib/orders'
import { type OrderItem } from '@/lib/order-items'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'

/**
 * Buyurtma puli bir qarashda: jami narx, nimasi olindi, nimasi
 * chegirma/qarz bo'ldi va yetkazishda yana qancha olinadi.
 *
 * Manbalar (server): `paidTotal`/`discountTotal`/`debtTotal` —
 * lib/paymentSummary.ts; oldindan to'lov va bonus — lib/prepayments.ts.
 * "Yetkazishda olinadi" — hali topshirilmagan mahsulotlar narxidan
 * ishlatilmagan oldindan to'lov/bonus qoldig'i ayirilgani.
 */
export function OrderPaymentSummary({ order, items, itemsLoading }: { order: Order; items: OrderItem[]; itemsLoading: boolean }) {
  const pending =
    order.serviceType === 'onsite' || items.length === 0
      ? order.status === 'done'
        ? 0
        : order.totalPrice
      : items.filter((i) => i.status !== 'done').reduce((s, i) => s + i.price, 0)
  const toCollect = Math.max(0, pending - prepaidCredit(order))
  const done = order.status === 'done'

  const state =
    order.debtTotal > 0
      ? { label: 'Qarz bor', tone: 'bg-danger-bg text-danger' }
      : done
        ? { label: "To'liq hisob-kitob qilingan", tone: 'bg-success-bg text-success' }
        : toCollect > 0
          ? { label: "To'lov yetkazishda", tone: 'bg-warning-bg text-[#8a5a00]' }
          : { label: "Oldindan to'langan", tone: 'bg-success-bg text-success' }

  const lines: { label: string; value: number; tone?: string; sign?: string; hint?: string }[] = []
  if (order.paidTotal > 0) lines.push({ label: 'Olindi', value: order.paidTotal, tone: 'text-success', hint: 'Topshirishda va keyin yopilgan qarzlar' })
  if (order.prepaidAmount > 0) lines.push({ label: "Oldindan to'lov", value: order.prepaidAmount, tone: 'text-success' })
  if (order.bonusAmount > 0) lines.push({ label: 'Bonusdan', value: order.bonusAmount })
  if (order.discountTotal > 0) lines.push({ label: 'Chegirma', value: order.discountTotal, sign: '−' })
  if (order.debtTotal > 0) lines.push({ label: 'Qarz (olinmagan)', value: order.debtTotal, tone: 'text-danger' })
  if (!itemsLoading && toCollect > 0) lines.push({ label: 'Yetkazishda olinadi', value: toCollect, tone: 'text-[#8a5a00]' })

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 bg-brand-primary/5 px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-dark">Umumiy summa</div>
          <div className="font-heading text-[28px] font-extrabold leading-tight tabular-nums text-brand-primary">
            {formatMoney(order.totalPrice)}
          </div>
        </div>
        <span className={cn('mb-1 rounded-full px-2.5 py-1 text-[11px] font-bold', state.tone)}>{state.label}</span>
      </div>
      {order.zeroPriceItemCount > 0 && (
        <p className="border-t border-border bg-danger-bg/40 px-4 py-2 text-xs font-semibold text-danger">
          {order.zeroPriceItemCount} ta mahsulot hali o'lchanmagan — summa o'lchangach oshadi
        </p>
      )}
      {order.estimatedPrice != null && order.totalPrice === 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-gray-dark">
          Taxminiy (sotuv menejeri): <strong className="text-ink">{formatMoney(order.estimatedPrice)}</strong>
        </p>
      )}
      {lines.length > 0 && (
        <dl className="divide-y divide-border border-t border-border">
          {lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-3 px-4 py-2">
              <dt className="min-w-0">
                <span className="text-[13px] font-semibold text-ink">{l.label}</span>
                {l.hint && <span className="block text-[11px] text-gray-dark">{l.hint}</span>}
              </dt>
              <dd className={cn('shrink-0 whitespace-nowrap text-sm font-extrabold tabular-nums', l.tone ?? 'text-ink')}>
                {l.sign}
                {formatMoney(l.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

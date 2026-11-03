import { AlertTriangle, ChevronRight, MessageSquare } from 'lucide-react'
import { type Order } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import { formatDateUz } from '@/lib/date-utils'
import { formatMoney, formatQty, unitList } from '@/lib/units'
import { cn } from '@/lib/utils'
import { TariffDots } from '@/components/ui/StatusBadge'
import { OrderProgress } from './OrderProgress'

/**
 * Buyurtmaning telefon uchun ko'rinishi — jadval qatorining o'rniga.
 *
 * Uch qatlam: raqam/sana va summa; mijoz va oxirgi izoh; haqiqiy holat
 * (mahsulotlar qayerda), hajm, muddat va to'lov belgilari. Kechikkan
 * buyurtma chap chetidagi qizil chiziq bilan ajralib turadi.
 */
export function OrderSummaryCard({
  order,
  onClick,
  matchedCount,
  matchedLabel,
}: {
  order: Order
  onClick: () => void
  /** Mahsulot holati bo'yicha filtrlanganda — shu holatdagi mahsulotlar soni. */
  matchedCount?: number | null
  matchedLabel?: string
}) {
  const overdue = isOrderOverdue(order)
  const dueDate = effectiveDueDate(order)
  const units = unitList(order.itemUnitTotals)

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border bg-surface text-left shadow-sm transition-colors active:bg-bg',
        overdue ? 'border-danger/40' : 'border-border',
      )}
    >
      <span className={cn('w-1 shrink-0', overdue ? 'bg-danger' : 'bg-brand-primary/30')} />

      <span className="min-w-0 flex-1 py-3 pr-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-heading text-[15px] font-extrabold text-ink">#{order.orderNumber}</span>
            <span className="text-[11px] text-gray-dark">{formatDateUz(order.createdAt)}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-heading text-sm font-extrabold tabular-nums text-brand-primary">
            {formatMoney(order.totalPrice)}
          </span>
        </span>

        <span className="mt-1 block text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
          {order.customerName || "Noma'lum"}
          <span className="font-normal text-gray-dark"> · {order.phone}</span>
        </span>

        <span className="mt-2 block">
          <OrderProgress order={order} />
        </span>

        {/* Holat filtri yoqilganda — buyurtma nima uchun ro'yxatda ekani. */}
        {matchedCount != null && matchedCount > 0 && (
          <span className="mt-1.5 inline-block rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-bold text-brand-primary">
            {matchedCount} ta {matchedLabel?.toLowerCase()}
          </span>
        )}

        {order.lastComment && (
          <span className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-dark">
            <MessageSquare size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{order.lastComment.text}</span>
          </span>
        )}

        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-dark">
          <span>{order.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}</span>
          {units.length > 0 && (
            <span className="font-semibold tabular-nums text-ink">
              {units.map((u) => `${formatQty(u.amount, u.unit)} ${u.label}`).join(' · ')}
            </span>
          )}
          {order.zeroPriceItemCount > 0 && <span className="font-bold text-danger">{order.zeroPriceItemCount} o'lchanmagan</span>}
          {order.debtTotal > 0 && <span className="font-bold text-danger">Qarz {formatMoney(order.debtTotal)}</span>}
          <TariffDots tariffs={distinctTariffs(order)} />
          {order.status !== 'done' && (
            <span className={cn('ml-auto flex items-center gap-1 font-bold', overdue ? 'text-danger' : 'text-ink')}>
              {overdue && <AlertTriangle size={12} />}
              {dueDate ? formatDateUz(dueDate) : '—'}
            </span>
          )}
        </span>
      </span>

      <span className="flex items-center pr-2 text-gray">
        <ChevronRight size={16} />
      </span>
    </button>
  )
}

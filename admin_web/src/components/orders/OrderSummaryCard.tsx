import { AlertTriangle } from 'lucide-react'
import { type Order } from '@/lib/orders'
import { distinctTariffs, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import { StatusBadge, TariffDots } from '@/components/ui/StatusBadge'
import { formatDateUz } from '@/lib/date-utils'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

/**
 * Buyurtmaning telefon uchun ko'rinishi — jadval qatorining o'rniga.
 *
 * Jadvallar 6-7 ustunli, telefonda ular gorizontal siljish talab qilar
 * va hech bir ustun to'liq ko'rinmasdi. Shu karta bir xil ma'lumotni
 * ikki-uch qatorda, hech narsani kesmasdan beradi.
 */
export function OrderSummaryCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const overdue = isOrderOverdue(order)
  const dueDate = effectiveDueDate(order)

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border bg-surface p-3.5 text-left transition-colors active:bg-bg ${
        overdue ? 'border-danger/40' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm font-extrabold text-ink">#{order.orderNumber}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-ink">{order.customerName || "Noma'lum"}</p>
          <p className="truncate text-xs text-gray-dark">{order.phone}</p>
        </div>
        <span className="shrink-0 font-heading text-sm font-extrabold text-brand-primary">
          {formatMoney(order.totalPrice)}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-xs">
        <span className="text-gray-dark">{order.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}</span>
        <TariffDots tariffs={distinctTariffs(order)} />
        <span className={`ml-auto flex items-center gap-1 font-bold ${overdue ? 'text-danger' : 'text-ink'}`}>
          {overdue && <AlertTriangle size={12} />}
          {dueDate ? formatDateUz(dueDate) : '—'}
        </span>
      </div>
    </button>
  )
}

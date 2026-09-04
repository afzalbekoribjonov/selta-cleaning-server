import { AlertTriangle, ChevronRight, Package } from 'lucide-react'
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
 * va hech bir ustun to'liq ko'rinmasdi. Karta bir xil ma'lumotni uch
 * qatorda beradi: buyurtma raqami va holati, mijoz, so'ng muddat/summa.
 * Kechikkan buyurtma chap chetidagi qizil chiziq bilan ajralib turadi.
 */
export function OrderSummaryCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const overdue = isOrderOverdue(order)
  const dueDate = effectiveDueDate(order)

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border bg-surface text-left shadow-sm transition-colors active:bg-bg ${
        overdue ? 'border-danger/40' : 'border-border'
      }`}
    >
      <span className={`w-1 shrink-0 ${overdue ? 'bg-danger' : 'bg-brand-primary/30'}`} />

      <span className="min-w-0 flex-1 py-3 pr-3">
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-heading text-sm font-extrabold text-ink">#{order.orderNumber}</span>
            <StatusBadge status={order.status} />
          </span>
          <span className="shrink-0 font-heading text-sm font-extrabold text-brand-primary">
            {formatMoney(order.totalPrice)}
          </span>
        </span>

        <span className="mt-1.5 block truncate text-sm font-semibold text-ink">
          {order.customerName || "Noma'lum"}
        </span>
        <span className="block truncate text-xs text-gray-dark">{order.phone}</span>

        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-dark">
          <span>{order.serviceType === 'onsite' ? 'Joyida yuvish' : 'Olib kelish'}</span>
          {order.itemCount != null && order.itemCount > 0 && (
            <span className="flex items-center gap-1">
              <Package size={11} />
              {order.itemCount} ta
            </span>
          )}
          <TariffDots tariffs={distinctTariffs(order)} />
          <span className={`ml-auto flex items-center gap-1 font-bold ${overdue ? 'text-danger' : 'text-ink'}`}>
            {overdue && <AlertTriangle size={12} />}
            {dueDate ? formatDateUz(dueDate) : '—'}
          </span>
        </span>
      </span>

      <span className="flex items-center pr-2 text-gray">
        <ChevronRight size={16} />
      </span>
    </button>
  )
}

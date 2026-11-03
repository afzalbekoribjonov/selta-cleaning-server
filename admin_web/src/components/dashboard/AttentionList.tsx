import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, CheckCircle2 } from 'lucide-react'
import { useActiveOrders } from '@/hooks/useRecentOrders'
import { type Order } from '@/lib/orders'
import { daysUntil, effectiveDueDate, isOrderOverdue } from '@/lib/order-tariffs'
import { itemProgressLabel } from '@/lib/order-status-filter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Panel } from '@/components/ui/Panel'

interface Reason {
  kind: 'overdue' | 'unmeasured' | 'returned'
  text: string
}

const REASON_STYLE: Record<Reason['kind'], string> = {
  overdue: 'bg-danger-bg text-danger',
  unmeasured: 'bg-warning-bg text-[#8a5a00]',
  returned: 'bg-[#fceaea] text-[#d64545]',
}

const LIMIT = 8

/**
 * "Diqqat talab qiladi" — umumiy faol ro'yxat emas (u Buyurtmalar
 * sahifasida), faqat aralashuv kerak bo'lganlar: muddati o'tgan,
 * o'lchanmagan (narxsiz) mahsuloti bor va sifatdan qaytgan. Eng ko'p
 * kechikkanlari tepada.
 */
export function AttentionList({ onOpen, className }: { onOpen: (order: Order) => void; className?: string }) {
  const { orders, loading } = useActiveOrders()

  const rows = useMemo(() => {
    const list: { order: Order; reasons: Reason[]; lateDays: number }[] = []
    for (const o of orders ?? []) {
      const reasons: Reason[] = []
      let lateDays = 0
      if (isOrderOverdue(o)) {
        lateDays = Math.max(1, -daysUntil(effectiveDueDate(o)!))
        reasons.push({ kind: 'overdue', text: `${lateDays} kun kechikdi` })
      }
      if (o.zeroPriceItemCount > 0 && o.serviceType === 'pickup' && o.status !== 'new') {
        reasons.push({ kind: 'unmeasured', text: `${o.zeroPriceItemCount} ta o'lchanmagan` })
      }
      const returned = o.itemStatusCounts.returned ?? 0
      if (returned > 0) reasons.push({ kind: 'returned', text: `${returned} ta qayta ishlovda` })
      if (reasons.length) list.push({ order: o, reasons, lateDays })
    }
    return list.sort((a, b) => b.lateDays - a.lateDays || b.reasons.length - a.reasons.length)
  }, [orders])

  return (
    <Panel
      className={className}
      icon={BellRing}
      title="Diqqat talab qiladi"
      subtitle={loading ? 'Yuklanmoqda…' : rows.length ? `${rows.length} ta buyurtma` : "Hammasi joyida"}
      actions={
        rows.length > LIMIT ? (
          <Link to="/orders?overdue=1" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-brand-primary hover:bg-brand-primary/5">
            Barchasi
            <ArrowRight size={14} />
          </Link>
        ) : undefined
      }
      bodyClassName="px-2 pb-2 sm:px-3 sm:pb-3"
    >
      {loading ? (
        <div className="space-y-2 px-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-bg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 size={28} className="text-success" />
          <p className="text-sm font-semibold text-ink">Kechikkan yoki o'lchanmagan buyurtma yo'q</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, LIMIT).map(({ order: o, reasons }) => (
            <li key={o.id}>
              <button
                onClick={() => onOpen(o)}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-bg sm:px-3"
              >
                <span className="mt-0.5 shrink-0 rounded-lg bg-brand-primary/10 px-2 py-1 font-heading text-xs font-extrabold text-brand-primary">
                  #{o.orderNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-bold text-ink">{o.customerName || "Noma'lum mijoz"}</span>
                    {!itemProgressLabel(o) && (
                      <span className="ml-auto shrink-0">
                        <StatusBadge status={o.status} />
                      </span>
                    )}
                  </span>
                  {itemProgressLabel(o) && (
                    <span className="mt-0.5 block truncate text-[11.5px] text-gray-dark">{itemProgressLabel(o)}</span>
                  )}
                  <span className="mt-1 flex flex-wrap gap-1">
                    {reasons.map((r) => (
                      <span key={r.kind} className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${REASON_STYLE[r.kind]}`}>
                        {r.text}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

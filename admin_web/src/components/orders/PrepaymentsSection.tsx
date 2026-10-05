import { useState } from 'react'
import { PiggyBank, Undo2 } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { prepaidCredit, type Order, type Prepayment } from '@/lib/orders'
import { formatDateTimeUz } from '@/lib/date-utils'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function methodLabel(p: Prepayment): string {
  if (p.cashAmount > 0 && p.cardAmount > 0) return 'Naqd + karta'
  return p.cardAmount > 0 ? 'Karta' : 'Naqd'
}

/**
 * Buyurtmaning oldindan to'lovlari. Admin xato kiritilganini istalgan
 * payt bekor qila oladi — faqat topshirishda hali ishlatilmagan bo'lsa
 * (server: routes/payments.ts, cancelPrepayment). To'lov bo'lmasa
 * bo'lim chiqmaydi.
 */
export function PrepaymentsSection({ order }: { order: Order }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (order.prepaidAmount <= 0 && order.prepayments.length === 0) return null
  const credit = prepaidCredit(order)
  const done = order.status === 'done'

  async function cancel(p: Prepayment) {
    if (!window.confirm(`${formatMoney(p.amount)} oldindan to'lov bekor qilinsinmi? O'sha kunning kassa hisobidan ham chiqadi.`)) {
      return
    }
    setBusyId(p.id)
    setError(null)
    try {
      await apiPost('/cancelPrepayment', { orderId: order.id, prepaymentId: p.id })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-success/35 bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <PiggyBank size={16} className="text-success" />
        <h3 className="text-sm font-extrabold text-ink">Oldindan to'lov</h3>
      </div>
      <Line label="To'langan" value={formatMoney(order.prepaidAmount)} tone="text-success" strong />
      {order.prepaidUsed > 0 && <Line label="Topshirishda hisobga olindi" value={formatMoney(order.prepaidUsed)} />}
      {credit > 0 && order.prepaidUsed > 0 && (
        <Line
          label={done ? 'Ortiqcha — mijozga qaytariladi' : 'Qoldiq'}
          value={formatMoney(credit)}
          tone={done ? 'text-warning' : 'text-ink'}
          strong={done}
        />
      )}
      <ul className="mt-2 divide-y divide-border border-t border-border">
        {order.prepayments.map((p) => (
          <li key={p.id} className="flex items-start gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-ink">{formatMoney(p.amount)}</div>
              <div className="truncate text-xs text-gray-dark">
                {[methodLabel(p), p.employeeName, p.at ? formatDateTimeUz(p.at) : null].filter(Boolean).join(' · ')}
              </div>
              {p.note && <div className="mt-0.5 text-xs text-ink">{p.note}</div>}
            </div>
            <button
              onClick={() => cancel(p)}
              disabled={busyId === p.id}
              title="To'lovni bekor qilish"
              className="shrink-0 rounded-lg p-1.5 text-gray-dark hover:bg-danger-bg hover:text-danger disabled:opacity-50"
            >
              <Undo2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
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

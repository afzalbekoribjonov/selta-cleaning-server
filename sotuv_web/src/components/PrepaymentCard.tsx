import { useState, type FormEvent } from 'react'
import { PiggyBank, Plus, Undo2, X, Banknote, CreditCard, Split } from 'lucide-react'
import { apiPost, describeApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { prepaidCredit, type Order, type Prepayment } from '@/lib/orders'
import { formatDateTimeUz } from '@/lib/date-utils'

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function methodLabel(p: Prepayment): string {
  if (p.cashAmount > 0 && p.cardAmount > 0) return 'Naqd + karta'
  return p.cardAmount > 0 ? 'Karta' : 'Naqd'
}

function isToday(date: Date | null): boolean {
  if (!date) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

/**
 * "Oldindan to'lov" — buyurtma kartasida. Ma'lumotni hamma ko'radi;
 * qabul qilish faqat admin "Oldindan to'lov" vakolatini berganlarga
 * (server ham tekshiradi). Qabul qilingan summa topshirishda mahsulotlar
 * narxidan ayiriladi (mobil ilova bilan bir xil qoida).
 */
export function PrepaymentCard({ order }: { order: Order }) {
  const { claims, canTakePrepayment } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const done = order.status === 'done'
  const canAdd = canTakePrepayment && !done
  const hasAny = order.prepaidAmount > 0 || order.prepayments.length > 0
  if (!hasAny && !canAdd) return null

  const credit = prepaidCredit(order)
  const rest = order.totalPrice - order.prepaidAmount - order.bonusAmount

  async function cancel(p: Prepayment) {
    if (!window.confirm(`${formatMoney(p.amount)} oldindan to'lov bekor qilinsinmi? Bugungi kassa hisobidan ham chiqadi.`)) return
    setBusyId(p.id)
    setError(null)
    try {
      await apiPost('/cancelPrepayment', { orderId: order.id, prepaymentId: p.id })
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={`rounded-2xl border bg-surface p-5 ${hasAny ? 'border-success/35' : 'border-border'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PiggyBank size={16} className="shrink-0 text-success" />
          <h3 className="truncate text-sm font-extrabold text-ink">Oldindan to'lov</h3>
        </div>
        {canAdd && hasAny && (
          <button
            onClick={() => setFormOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-brand-primary hover:bg-brand-primary/10"
          >
            <Plus size={14} />
            Qo'shish
          </button>
        )}
      </div>

      {!hasAny ? (
        <>
          <p className="text-xs font-medium text-gray-dark">
            Mijoz hali oldindan to'lov qilmagan. Qabul qilingan summa topshirishda narxdan ayiriladi.
          </p>
          <button
            onClick={() => setFormOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-success-bg py-2.5 text-sm font-extrabold text-success hover:opacity-90"
          >
            <Plus size={16} />
            Oldindan to'lov qabul qilish
          </button>
        </>
      ) : (
        <>
          <Line label="To'langan" value={formatMoney(order.prepaidAmount)} tone="text-success" strong />
          {order.prepaidUsed > 0 ? (
            <>
              <Line label="Topshirishda hisobga olindi" value={formatMoney(order.prepaidUsed)} />
              {credit > 0 &&
                (done ? (
                  <Line label="Ortiqcha — mijozga qaytariladi" value={formatMoney(credit)} tone="text-warning" strong />
                ) : (
                  <Line label="Qoldiq" value={formatMoney(credit)} />
                ))}
            </>
          ) : (
            !done &&
            order.totalPrice > 0 &&
            (rest >= 0 ? (
              <Line label="Topshirishda olinadi" value={formatMoney(rest)} strong />
            ) : (
              <Line label="Ortiqcha to'langan" value={formatMoney(-rest)} tone="text-warning" strong />
            ))
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
                {p.employeeId === claims?.employeeId && isToday(p.at) && (
                  <button
                    onClick={() => cancel(p)}
                    disabled={busyId === p.id}
                    title="To'lovni bekor qilish"
                    className="shrink-0 rounded-lg p-1.5 text-gray-dark hover:bg-bg hover:text-danger disabled:opacity-50"
                  >
                    <Undo2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      {formOpen && <AddPrepaymentModal order={order} onClose={() => setFormOpen(false)} />}
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

type Method = 'cash' | 'card' | 'mixed'

function AddPrepaymentModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { fullName } = useAuth()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [cashPart, setCashPart] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Takroriy bosish ikkinchi to'lov yozmasligi uchun ID oldindan beriladi.
  const [prepaymentId] = useState(() => crypto.randomUUID())

  const total = Number(amount) || 0
  const cash = method === 'cash' ? total : method === 'card' ? 0 : Number(cashPart) || 0
  const card = total - cash

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!(total > 0)) return setError('Summani kiriting')
    if (method === 'mixed' && (cashPart === '' || cash < 0 || cash > total)) return setError("Naqd qismini to'g'ri kiriting")
    setSaving(true)
    try {
      await apiPost('/addPrepayment', {
        orderId: order.id,
        prepaymentId,
        amount: total,
        cashAmount: cash,
        cardAmount: card,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(fullName ? { actorName: fullName } : {}),
      })
      onClose()
    } catch (err) {
      setError(describeApiError(err))
      setSaving(false)
    }
  }

  const methods: { key: Method; label: string; icon: typeof Banknote }[] = [
    { key: 'cash', label: 'Naqd', icon: Banknote },
    { key: 'card', label: 'Karta', icon: CreditCard },
    { key: 'mixed', label: 'Aralash', icon: Split },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-3xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-ink">Oldindan to'lov</h2>
            <p className="truncate text-xs text-gray-dark">
              Buyurtma #{order.orderNumber} · {order.customerName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        {(order.totalPrice > 0 || order.prepaidAmount > 0) && (
          <div className="rounded-xl bg-bg px-3.5 py-2">
            {order.totalPrice > 0 && <Line label="Buyurtma summasi" value={formatMoney(order.totalPrice)} />}
            {order.prepaidAmount > 0 && <Line label="Avval to'langan" value={formatMoney(order.prepaidAmount)} tone="text-success" />}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Summa (so'm)</label>
          <input
            autoFocus
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-lg font-extrabold outline-none focus:border-brand-primary"
          />
          {total > 0 && <p className="mt-1 text-xs font-semibold text-gray-dark">{formatMoney(total)}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Qanday to'landi?</label>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold ${
                  method === m.key ? 'border-brand-primary bg-brand-primary text-white' : 'border-border bg-bg text-ink'
                }`}
              >
                <m.icon size={14} />
                {m.label}
              </button>
            ))}
          </div>
          {method === 'mixed' && (
            <div className="mt-2">
              <input
                inputMode="numeric"
                placeholder="Naqd qismi"
                value={cashPart}
                onChange={(e) => setCashPart(e.target.value.replace(/\D/g, '').slice(0, 9))}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2 text-sm font-bold outline-none focus:border-brand-primary"
              />
              {cashPart !== '' && cash <= total && (
                <p className="mt-1 text-xs font-semibold text-gray-dark">Karta orqali: {formatMoney(card)}</p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Izoh (ixtiyoriy)</label>
          <input
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>

        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-success py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? 'Saqlanmoqda...' : 'Qabul qilish'}
        </button>
      </form>
    </div>
  )
}

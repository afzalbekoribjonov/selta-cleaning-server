import { useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { searchOrdersByPhone, type Order } from '@/lib/orders'
import { formatUzPhoneInput, phoneDigits } from '@/lib/phone'
import { formatDateUz, formatDateTimeUz } from '@/lib/date-utils'
import { StatusBadge, TariffBadge } from '@/components/Badge'
import { Spinner } from '@/components/Spinner'
import { OrderDetailDrawer } from '@/components/OrderDetailDrawer'
import { describeApiError } from '@/lib/api'

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function SearchPage() {
  const [phone, setPhone] = useState('')
  const [results, setResults] = useState<Order[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  async function handleSearch() {
    const digits = phoneDigits(phone)
    if (digits.length !== 9) {
      setError('9 xonali telefon raqam kiriting')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const orders = await searchOrdersByPhone(`+998${digits}`)
      setResults(orders)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="font-heading text-2xl font-extrabold text-ink">Buyurtmalarni qidirish</h1>
      <p className="mt-1 text-sm text-gray-dark">
        Telefon raqam bo'yicha — mijozning barcha (istalgan holatdagi) buyurtmalari
      </p>

      <div className="mt-6 flex gap-3">
        <div className="flex flex-1 items-center rounded-xl border border-border bg-surface pl-3.5 focus-within:border-brand-primary">
          <span className="text-sm font-semibold text-gray-dark">+998</span>
          <input
            value={phone}
            onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            inputMode="numeric"
            placeholder="90 123 45 67"
            className="w-full bg-transparent px-2 py-3 text-sm outline-none"
            autoFocus
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60"
        >
          <SearchIcon size={16} />
          Qidirish
        </button>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

      <div className="mt-8">
        {loading ? (
          <Spinner className="py-16" />
        ) : results === null ? (
          <p className="py-10 text-center text-sm text-gray-dark">Telefon raqamni kiriting va qidiring</p>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-dark">Bu raqamga tegishli buyurtma topilmadi</p>
        ) : (
          <>
            <p className="mb-3 text-sm font-bold text-gray-dark">{results.length} ta buyurtma topildi</p>
            <div className="space-y-3">
              {results.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setOpenOrderId(order.id)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-brand-primary/40"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-sm font-extrabold text-brand-primary">
                    #{order.orderNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink">{order.customerName || "Noma'lum mijoz"}</p>
                    <p className="text-xs text-gray-dark">{order.location}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex gap-1.5">
                      <StatusBadge status={order.status} />
                      {order.tariff && <TariffBadge tariff={order.tariff} />}
                    </div>
                    <p className="text-xs text-gray-dark">{formatDateTimeUz(order.createdAt)}</p>
                  </div>
                  <div className="w-28 shrink-0 text-right">
                    <p className="font-extrabold text-brand-primary">{formatMoney(order.totalPrice || order.estimatedPrice || 0)}</p>
                    {order.dueDate && <p className="text-xs text-gray-dark">Muddat: {formatDateUz(order.dueDate)}</p>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {openOrderId && <OrderDetailDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </div>
  )
}

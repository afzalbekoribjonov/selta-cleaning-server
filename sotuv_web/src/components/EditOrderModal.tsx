import { useState } from 'react'
import { X } from 'lucide-react'
import { TARIFF_CONFIG } from '@/lib/status-config'
import { updateOrder } from '@/lib/orders-api'
import { formatUzPhoneInput, phoneDigits } from '@/lib/phone'
import { describeApiError } from '@/lib/api'
import type { Order } from '@/lib/orders'

export function EditOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const isOnsite = order.serviceType === 'onsite'
  const [name, setName] = useState(order.customerName)
  const [phone, setPhone] = useState(order.phone.replace('+998', ''))
  const [location, setLocation] = useState(order.location)
  const [tariff, setTariff] = useState<string>(order.tariff ?? 'standart')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateOrder({
        orderId: order.id,
        customerName: name.trim(),
        phone: `+998${phoneDigits(phone)}`,
        location: location.trim(),
        tariff: isOnsite ? tariff : undefined,
      })
      onClose()
    } catch (e) {
      setError(describeApiError(e))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-extrabold text-ink">Buyurtmani tahrirlash</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-dark hover:bg-bg">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink">Ism familiya</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink">Telefon</label>
            <div className="flex items-center rounded-xl border border-border bg-bg pl-3.5 focus-within:border-brand-primary">
              <span className="text-sm font-semibold text-gray-dark">+998</span>
              <input
                value={phone}
                onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
                inputMode="numeric"
                className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink">Mo'ljal</label>
            <textarea
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          {isOnsite && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-ink">Tarif</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(TARIFF_CONFIG).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setTariff(key)}
                    className="rounded-full px-3.5 py-1.5 text-xs font-bold"
                    style={
                      tariff === key
                        ? { background: info.color, color: 'white' }
                        : { background: 'var(--color-bg)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                    }
                  >
                    {info.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-dark hover:bg-bg">
            Bekor qilish
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

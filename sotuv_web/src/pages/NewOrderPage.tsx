import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, Truck, Store, Plus, X } from 'lucide-react'
import { TARIFF_CONFIG } from '@/lib/status-config'
import { useOrderSources } from '@/hooks/useOrderSources'
import { useAuth } from '@/lib/auth-context'
import { formatUzPhoneInput, phoneDigits } from '@/lib/phone'
import { createOrder } from '@/lib/orders-api'
import { addComment } from '@/lib/order-items'
import type { CatalogItemDraft } from '@/lib/order-items'
import { describeApiError } from '@/lib/api'
import { CatalogItemModal } from '@/components/CatalogItemModal'

type ServiceType = 'onsite' | 'pickup' | 'walkin'

const SERVICE_OPTIONS: { key: ServiceType; label: string; icon: typeof Home }[] = [
  { key: 'onsite', label: 'Joyida yuvish', icon: Home },
  { key: 'pickup', label: 'Olib kelish', icon: Truck },
  { key: 'walkin', label: "O'zi keldi", icon: Store },
]

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function NewOrderPage() {
  const navigate = useNavigate()
  const { claims, fullName } = useAuth()
  const { sources } = useOrderSources()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [comment, setComment] = useState('')
  const [notedItems, setNotedItems] = useState('')
  const [estimatedPrice, setEstimatedPrice] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [onsiteTariff, setOnsiteTariff] = useState('standart')
  const [draftItems, setDraftItems] = useState<CatalogItemDraft[]>([])
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPickup = serviceType === 'pickup' || serviceType === 'walkin'
  const isWalkIn = serviceType === 'walkin'
  const draftTotal = draftItems.reduce((s, d) => s + (d.price ?? 0), 0)

  function resetForm() {
    setName('')
    setPhone('')
    setLocation('')
    setComment('')
    setNotedItems('')
    setEstimatedPrice('')
    setServiceType(null)
    setSource(null)
    setOnsiteTariff('standart')
    setDraftItems([])
  }

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Ism familiyani kiriting')
    if (phoneDigits(phone).length !== 9) return setError("9 xonali telefon raqam kiriting")
    if (!location.trim()) return setError("Mo'ljalni kiriting")
    if (!serviceType) return setError('Xizmat turini tanlang')
    if (isPickup && draftItems.length === 0) return setError('Kamida bitta mahsulot qoshing')

    setSaving(true)
    try {
      const notedList = notedItems
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const estPrice = parseFloat(estimatedPrice.replace(',', '.'))

      const result = await createOrder({
        customerName: name.trim(),
        phone: `+998${phoneDigits(phone)}`,
        location: location.trim(),
        serviceType: isPickup ? 'pickup' : 'onsite',
        tariff: isPickup ? undefined : onsiteTariff,
        items: isPickup ? draftItems : undefined,
        notedItems: isPickup ? undefined : notedList,
        estimatedPrice: isPickup ? undefined : Number.isFinite(estPrice) ? estPrice : undefined,
        source: source ?? undefined,
        walkIn: isWalkIn,
        actorName: fullName ?? undefined,
      })

      const commentText = comment.trim()
      if (commentText && claims) {
        await addComment(result.orderId, claims.employeeId, fullName ?? 'Xodim', commentText)
      }

      resetForm()
      navigate('/', { state: { justCreated: result.orderNumber } })
    } catch (e) {
      setError(describeApiError(e))
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="font-heading text-2xl font-extrabold text-ink">Yangi buyurtma</h1>
      <p className="mt-1 text-sm text-gray-dark">Mijoz ma'lumotlarini kiriting</p>

      <div className="mt-7 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Mijoz ma'lumotlari">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Ism familiya">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </Field>
              <Field label="Telefon raqam">
                <div className="flex items-center rounded-xl border border-border bg-surface pl-3.5 focus-within:border-brand-primary">
                  <span className="text-sm font-semibold text-gray-dark">+998</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
                    inputMode="numeric"
                    placeholder="90 123 45 67"
                    className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"
                  />
                </div>
              </Field>
            </div>
            <Field label="Mo'ljal">
              <textarea
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </Field>
          </Section>

          <Section title="Manba (ixtiyoriy)">
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSource(source === s.id ? null : s.id)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
                  style={
                    source === s.id
                      ? { background: s.color, color: 'white' }
                      : { background: 'var(--color-surface)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                  }
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Xizmat turi">
            <div className="grid grid-cols-3 gap-3">
              {SERVICE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setServiceType(opt.key)}
                  className="flex flex-col items-center gap-2 rounded-2xl border py-5 transition-colors"
                  style={
                    serviceType === opt.key
                      ? { borderColor: '#5A148C', background: 'rgba(90,20,140,0.08)', borderWidth: 1.5 }
                      : { borderColor: 'var(--color-border)' }
                  }
                >
                  <opt.icon size={22} color={serviceType === opt.key ? '#5A148C' : '#7A7482'} />
                  <span
                    className="text-sm font-bold"
                    style={{ color: serviceType === opt.key ? '#5A148C' : 'var(--color-ink)' }}
                  >
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
            {isWalkIn && (
              <p className="mt-3 rounded-xl bg-brand-accent/10 px-3.5 py-2.5 text-xs font-semibold text-ink">
                Mijoz do'konga o'zi keldi — buyurtma dastavchiklarga ko'rinmaydi, to'g'ridan-to'g'ri ishchilar navbatiga
                (Kutilmoqda) tushadi.
              </p>
            )}
          </Section>

          {serviceType === 'onsite' && (
            <Section title="Joyida yuvish tafsilotlari">
              <p className="mb-2 text-xs font-bold text-ink">Tarif</p>
              <div className="flex flex-wrap gap-2.5">
                {Object.entries(TARIFF_CONFIG).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setOnsiteTariff(key)}
                    className="w-36 rounded-2xl border px-4 py-3 text-left transition-colors"
                    style={
                      onsiteTariff === key
                        ? { background: info.color, borderColor: info.color }
                        : { background: info.bg, borderColor: `${info.color}4D` }
                    }
                  >
                    <p className="text-sm font-extrabold" style={{ color: onsiteTariff === key ? 'white' : info.color }}>
                      {info.label}
                    </p>
                    <p className="text-xs" style={{ color: onsiteTariff === key ? 'rgba(255,255,255,0.85)' : `${info.color}CC` }}>
                      {info.days}
                    </p>
                  </button>
                ))}
              </div>

              <Field label="Mahsulot nomlari (ixtiyoriy)" className="mt-5">
                <p className="mb-1.5 text-xs text-gray-dark">
                  Mijoz aytgan mahsulotlarni vergul bilan ajratib yozing — masalan: Gilam, Parda, Yakandoz.
                </p>
                <input
                  value={notedItems}
                  onChange={(e) => setNotedItems(e.target.value)}
                  placeholder="Gilam, Parda, Yakandoz"
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </Field>
              <Field label="Taxminiy umumiy summa (ixtiyoriy)">
                <input
                  value={estimatedPrice}
                  onChange={(e) => setEstimatedPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="Masalan: 500000"
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </Field>
            </Section>
          )}

          {isPickup && (
            <Section
              title="Mahsulotlar"
              action={
                <button
                  onClick={() => setItemModalOpen(true)}
                  className="flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline"
                >
                  <Plus size={16} />
                  {draftItems.length === 0 ? "Qo'shish" : 'Yana qo\'shish'}
                </button>
              }
            >
              {draftItems.length === 0 ? (
                <p className="text-sm text-gray-dark">Hali mahsulot qo'shilmagan</p>
              ) : (
                <div className="space-y-2">
                  {draftItems.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5"
                    >
                      <span className="rounded-lg bg-brand-primary/10 px-2 py-0.5 text-xs font-extrabold text-brand-primary">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-ink">{d.name}</p>
                        {d.tariff && (
                          <p className="text-xs font-bold" style={{ color: TARIFF_CONFIG[d.tariff]?.color }}>
                            {TARIFF_CONFIG[d.tariff]?.label}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-gray-dark">{formatMoney(d.price ?? 0)}</span>
                      <button
                        onClick={() => setDraftItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="rounded-lg p-1 text-gray-dark hover:bg-bg"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          <Section title="Izoh (ixtiyoriy)">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </Section>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="mb-4 font-heading text-sm font-extrabold text-ink">Buyurtma xulosasi</h3>
            <SummaryRow label="Mijoz" value={name || '—'} />
            <SummaryRow label="Telefon" value={phone ? `+998 ${phone}` : '—'} />
            <SummaryRow
              label="Xizmat turi"
              value={serviceType ? SERVICE_OPTIONS.find((o) => o.key === serviceType)?.label ?? '—' : '—'}
            />
            {isPickup && (
              <>
                <div className="my-3 border-t border-border" />
                <SummaryRow label="Mahsulotlar" value={`${draftItems.length} ta`} />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">Jami</span>
                  <span className="text-lg font-extrabold text-brand-primary">{formatMoney(draftTotal)}</span>
                </div>
              </>
            )}
            {serviceType === 'onsite' && estimatedPrice && (
              <>
                <div className="my-3 border-t border-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">Taxminiy summa</span>
                  <span className="text-lg font-extrabold text-brand-primary">
                    {formatMoney(parseFloat(estimatedPrice.replace(',', '.')) || 0)}
                  </span>
                </div>
              </>
            )}

            {error && <p className="mt-4 text-sm font-semibold text-danger">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-brand-primary py-3.5 text-sm font-extrabold tracking-wide text-white shadow-sm disabled:opacity-60"
            >
              {saving ? 'SAQLANMOQDA...' : 'TASDIQLASH'}
            </button>
          </div>
        </div>
      </div>

      {itemModalOpen && (
        <CatalogItemModal
          serviceType="pickup"
          onClose={() => setItemModalOpen(false)}
          onLocalAdd={(draft) => setDraftItems((prev) => [...prev, draft])}
        />
      )}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-bg/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-sm font-extrabold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`mt-4 first:mt-0 ${className ?? ''}`}>
      <label className="mb-1.5 block text-xs font-bold text-ink">{label}</label>
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-semibold text-gray-dark">{label}</span>
      <span className="max-w-[60%] truncate text-right text-sm font-bold text-ink">{value}</span>
    </div>
  )
}

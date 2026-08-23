import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Phone, MapPin, Tag, Home, Truck, Store, Package, MessageSquare, Plus, X, ShieldCheck, ArrowRight } from 'lucide-react'
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

const SERVICE_OPTIONS: { key: ServiceType; label: string; hint: string; icon: typeof Home }[] = [
  { key: 'onsite', label: 'Joyida yuvish', hint: 'Jamoa mijoz uyiga boradi', icon: Home },
  { key: 'pickup', label: 'Olib kelish', hint: 'Dastavchik olib keladi', icon: Truck },
  { key: 'walkin', label: "O'zi keldi", hint: "Mijoz do'konga keldi", icon: Store },
]

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-ink outline-none transition-colors placeholder:text-gray focus:border-brand-primary focus:bg-surface'
const textareaClass =
  'w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-gray focus:border-brand-primary focus:bg-surface'
const fieldWrapClass =
  'flex h-11 items-center rounded-xl border border-border bg-bg pl-4 transition-colors focus-within:border-brand-primary focus-within:bg-surface'

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
    if (phoneDigits(phone).length !== 9) return setError('9 xonali telefon raqam kiriting')
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
    <div className="mx-auto max-w-6xl px-10 py-10">
      <div className="mb-8">
        <h1 className="font-heading text-[28px] font-extrabold text-ink">Yangi buyurtma</h1>
        <p className="mt-1.5 text-sm text-gray-dark">Mijoz ma'lumotlarini kiriting va buyurtmani rasmiylashtiring</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section icon={User} title="Mijoz ma'lumotlari">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Ism familiya">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mijozning to'liq ismi"
                  className={inputClass}
                />
              </Field>
              <Field label="Telefon raqam">
                <div className={fieldWrapClass}>
                  <span className="shrink-0 text-sm font-bold text-gray-dark">+998</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
                    inputMode="numeric"
                    placeholder="90 123 45 67"
                    className="h-full w-full bg-transparent px-2.5 text-sm outline-none"
                  />
                </div>
              </Field>
            </div>
            <Field label="Mo'ljal" icon={MapPin}>
              <textarea
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                rows={2}
                placeholder="Mijoz manzili yoki mo'ljal"
                className={textareaClass}
              />
            </Field>
          </Section>

          {sources.length > 0 && (
            <Section icon={Tag} title="Manba" subtitle="Ixtiyoriy — marketing statistikasi uchun">
              <div className="flex flex-wrap gap-2">
                {sources.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    color={s.color}
                    active={source === s.id}
                    onClick={() => setSource(source === s.id ? null : s.id)}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section icon={Package} title="Xizmat turi">
            <div className="grid grid-cols-3 gap-3.5">
              {SERVICE_OPTIONS.map((opt) => {
                const selected = serviceType === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => setServiceType(opt.key)}
                    className={`group flex flex-col items-center gap-2.5 rounded-2xl border-[1.5px] py-6 text-center transition-all ${
                      selected ? 'border-brand-primary bg-brand-primary/[0.06] shadow-sm' : 'border-border bg-bg hover:border-brand-primary/30'
                    }`}
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                        selected ? 'bg-brand-primary text-white' : 'bg-surface text-gray-dark group-hover:text-brand-primary'
                      }`}
                    >
                      <opt.icon size={22} />
                    </div>
                    <div>
                      <p className={`text-sm font-extrabold ${selected ? 'text-brand-primary' : 'text-ink'}`}>{opt.label}</p>
                      <p className="mt-0.5 text-[11.5px] text-gray-dark">{opt.hint}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            {isWalkIn && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-accent/10 px-4 py-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink/70" />
                <p className="text-xs font-semibold leading-relaxed text-ink">
                  Mijoz do'konga o'zi keldi — buyurtma dastavchiklarga ko'rinmaydi, to'g'ridan-to'g'ri ishchilar navbatiga
                  (Kutilmoqda) tushadi.
                </p>
              </div>
            )}
          </Section>

          {serviceType === 'onsite' && (
            <Section icon={ShieldCheck} title="Joyida yuvish tafsilotlari">
              <p className="mb-2.5 text-xs font-bold text-ink">Tarif</p>
              <div className="flex flex-wrap gap-2.5">
                {Object.entries(TARIFF_CONFIG).map(([key, info]) => {
                  const selected = onsiteTariff === key
                  return (
                    <button
                      key={key}
                      onClick={() => setOnsiteTariff(key)}
                      className="w-36 rounded-xl border-[1.5px] px-4 py-3 text-left transition-all"
                      style={selected ? { background: info.color, borderColor: info.color } : { background: info.bg, borderColor: 'transparent' }}
                    >
                      <p className="text-sm font-extrabold" style={{ color: selected ? 'white' : info.color }}>
                        {info.label}
                      </p>
                      <p className="text-xs" style={{ color: selected ? 'rgba(255,255,255,0.85)' : `${info.color}CC` }}>
                        {info.days}
                      </p>
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4">
                <Field label="Mahsulot nomlari (ixtiyoriy)">
                  <p className="mb-2 text-xs leading-relaxed text-gray-dark">
                    Mijoz aytgan mahsulotlarni vergul bilan ajratib yozing — masalan: Gilam, Parda, Yakandoz. Jamoa mijoz
                    uyida haqiqiy mahsulotlarni aniqlashtirib qo'shadi.
                  </p>
                  <input
                    value={notedItems}
                    onChange={(e) => setNotedItems(e.target.value)}
                    placeholder="Gilam, Parda, Yakandoz"
                    className={inputClass}
                  />
                </Field>
                <Field label="Taxminiy umumiy summa (ixtiyoriy)">
                  <div className={`${fieldWrapClass} pr-4`}>
                    <input
                      value={estimatedPrice}
                      onChange={(e) => setEstimatedPrice(e.target.value)}
                      inputMode="decimal"
                      placeholder="Masalan: 500000"
                      className="h-full w-full bg-transparent px-4 text-sm outline-none"
                    />
                    <span className="shrink-0 text-xs font-bold text-gray-dark">so'm</span>
                  </div>
                </Field>
              </div>
            </Section>
          )}

          {isPickup && (
            <Section
              icon={Package}
              title="Mahsulotlar"
              action={
                draftItems.length > 0 && (
                  <button
                    onClick={() => setItemModalOpen(true)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-primary/10 px-3 py-1.5 text-xs font-extrabold text-brand-primary hover:bg-brand-primary/15"
                  >
                    <Plus size={14} />
                    Yana qo'shish
                  </button>
                )
              }
            >
              {draftItems.length === 0 ? (
                <button
                  onClick={() => setItemModalOpen(true)}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-gray-dark transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                    <Plus size={20} />
                  </div>
                  <span className="text-sm font-bold">Mahsulot qo'shish</span>
                </button>
              ) : (
                <div className="space-y-2">
                  {draftItems.map((d, i) => {
                    const tariffInfo = d.tariff ? TARIFF_CONFIG[d.tariff] : null
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3.5 rounded-xl border border-border bg-bg py-2.5 pl-1 pr-3.5"
                        style={{ borderLeftWidth: 3, borderLeftColor: tariffInfo?.color ?? 'var(--color-border)' }}
                      >
                        <span className="ml-2.5 shrink-0 rounded-lg bg-brand-primary/10 px-2 py-0.5 text-xs font-extrabold text-brand-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">{d.name}</p>
                          {tariffInfo && <p className="text-[11px] font-bold" style={{ color: tariffInfo.color }}>{tariffInfo.label}</p>}
                        </div>
                        <span className="shrink-0 text-sm font-extrabold text-ink">{formatMoney(d.price ?? 0)}</span>
                        <button
                          onClick={() => setDraftItems((prev) => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 rounded-lg p-1.5 text-gray-dark transition-colors hover:bg-danger-bg hover:text-danger"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          <Section icon={MessageSquare} title="Izoh" subtitle="Ixtiyoriy">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Qo'shimcha izoh..."
              className={textareaClass}
            />
          </Section>
        </div>

        <div className="lg:sticky lg:top-10 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
            <div className="bg-gradient-to-br from-brand-primary to-brand-primary-dark px-6 py-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/60">Buyurtma xulosasi</p>
              <p className="mt-1 truncate font-heading text-lg font-extrabold text-white">{name || 'Yangi mijoz'}</p>
            </div>

            <div className="p-6">
              <SummaryRow icon={Phone} label="Telefon" value={phone ? `+998 ${phone}` : '—'} />
              <SummaryRow
                icon={Package}
                label="Xizmat turi"
                value={serviceType ? SERVICE_OPTIONS.find((o) => o.key === serviceType)?.label ?? '—' : '—'}
              />
              {source && <SummaryRow icon={Tag} label="Manba" value={sources.find((s) => s.id === source)?.name ?? '—'} />}

              {isPickup && (
                <>
                  <div className="my-4 border-t border-dashed border-border" />
                  <SummaryRow icon={Package} label="Mahsulotlar" value={`${draftItems.length} ta`} />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">Jami summa</span>
                    <span className="font-heading text-xl font-extrabold text-brand-primary">{formatMoney(draftTotal)}</span>
                  </div>
                </>
              )}
              {serviceType === 'onsite' && estimatedPrice && (
                <>
                  <div className="my-4 border-t border-dashed border-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">Taxminiy summa</span>
                    <span className="font-heading text-xl font-extrabold text-brand-primary">
                      {formatMoney(parseFloat(estimatedPrice.replace(',', '.')) || 0)}
                    </span>
                  </div>
                </>
              )}

              {error && (
                <p className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-xs font-bold text-danger">{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 text-sm font-extrabold tracking-wide text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? (
                  'SAQLANMOQDA...'
                ) : (
                  <>
                    TASDIQLASH
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
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

function Section({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: typeof User
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading text-[15px] font-extrabold text-ink">{title}</h2>
          {subtitle && <p className="text-[11px] font-semibold text-gray-dark">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, className, children }: { label: string; icon?: typeof User; className?: string; children: ReactNode }) {
  return (
    <div className={`mt-4 first:mt-0 ${className ?? ''}`}>
      <label className="mb-1.5 block text-xs font-bold text-ink">{label}</label>
      {children}
    </div>
  )
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-dark">
        <Icon size={13} />
        {label}
      </span>
      <span className="max-w-[60%] truncate text-right text-sm font-bold text-ink">{value}</span>
    </div>
  )
}

function Chip({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
      style={
        active
          ? { background: color, color: 'white' }
          : { background: 'var(--color-bg)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
      }
    >
      {label}
    </button>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Mail, ShieldCheck, Info, Clock3, KeyRound, Check, RotateCcw, Warehouse, Gift } from 'lucide-react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '@/lib/auth-context'
import { ApiError } from '@/lib/api'
import { TARIFF_CONFIG } from '@/lib/status-config'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { useTariffs } from '@/hooks/useTariffs'
import {
  DEFAULT_TARIFFS,
  TARIFF_KEYS,
  updateTariffs,
  validateTariffSetting,
  type TariffConfig,
  type TariffSetting,
} from '@/lib/tariffs'
import { Spinner } from '@/components/ui/Spinner'
import { ReceiptSettingsCard } from '@/components/settings/ReceiptSettingsCard'
import { DEFAULT_WAREHOUSE_DAYS, subscribeWarehouseDays, updateWarehouseDays } from '@/lib/warehouse'
import {
  DEFAULT_BONUS_PERCENT,
  MAX_BONUS_PERCENT,
  isValidBonusPercent,
  subscribeBonusPercent,
  updateBonusPercent,
} from '@/lib/bonus'

const TARIFF_NOTES: Record<string, string> = {
  express: 'Eng tezkor xizmat — muddat ustuvor.',
  comfort: "O'rtacha muddat, standart sifat.",
  standart: 'Eng uzun muddat, eng arzon tarif.',
  premium: "Tezlik Express bilan bir xil, lekin yuqori sifat — maxsus vositalar va alohida e'tibor bilan bajariladi.",
}

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Sozlamalar</h1>
        <p className="mt-1 text-sm text-gray-dark">Hisob ma'lumotlari va tizim konfiguratsiyasi</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 font-heading font-bold text-ink">
          <ShieldCheck size={18} className="text-brand-primary" />
          Admin hisobi
        </h2>
        <div className="flex items-center gap-3 rounded-xl bg-bg p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <Mail size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{user?.email ?? '—'}</div>
            <div className="text-xs text-gray-dark">Administrator</div>
          </div>
        </div>
      </section>

      <ChangePasswordCard />

      <TariffSettingsCard />

      <WarehouseSettingsCard />
      <BonusSettingsCard />
      <ReceiptSettingsCard />

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
          <Info size={18} className="text-brand-primary" />
          Maosh hisoblash usullari
        </h2>
        <p className="mb-4 text-xs text-gray-dark">
          Har bir xodimga usul va parametrlar Xodimlar sahifasida — "Maosh sozlash" tugmasi orqali belgilanadi.
        </p>
        <div className="space-y-2">
          {Object.entries(SALARY_METHODS).map(([key, m]) => (
            <div key={key} className="flex flex-col gap-1 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-ink">{m.label}</div>
                <div className="text-xs text-gray-dark">{m.description}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.fields.map((f) => (
                  <span key={f.key} className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-primary">
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-gray">Selta Cleaning admin panel · v1.0</p>
    </div>
  )
}

function describePasswordError(err: unknown): string {
  const code = (err as { code?: string })?.code
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "Joriy parol noto'g'ri"
    case 'auth/weak-password':
      return 'Yangi parol juda oddiy — kamida 6 ta belgidan iborat bo\'lsin'
    case 'auth/too-many-requests':
      return "Juda ko'p urinish — birozdan so'ng qayta urining"
    case 'auth/requires-recent-login':
      return "Xavfsizlik uchun qayta kirib, so'ng urinib ko'ring"
    default:
      return 'Xatolik yuz berdi'
  }
}

function ChangePasswordCard() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword.length < 6) {
      setError('Yangi parol kamida 6 ta belgidan iborat bo\'lishi kerak')
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Yangi parol va tasdiqlash mos kelmadi")
      return
    }
    if (!user?.email) {
      setError('Foydalanuvchi aniqlanmadi')
      return
    }

    setSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(describePasswordError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
        <KeyRound size={18} className="text-brand-primary" />
        Parolni o'zgartirish
      </h2>
      <p className="mb-4 text-xs text-gray-dark">Admin panelga kirish uchun ishlatiladigan parol</p>

      <form className="max-w-sm space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Joriy parol</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Yangi parol</label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Yangi parolni tasdiqlash</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-success">Parol muvaffaqiyatli o'zgartirildi</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </form>
    </section>
  )
}

/** Tahrirlanayotgan qiymatlar matn sifatida — yozayotganda bo'sh maydon
 *  ham bo'lishi mumkin, shuning uchun raqamga faqat tekshirish paytida
 *  aylantiriladi. */
type Draft = Record<string, { days: string; green: string; yellow: string }>

function toDraft(config: TariffConfig): Draft {
  const draft: Draft = {}
  for (const key of TARIFF_KEYS) {
    const t = config[key] ?? DEFAULT_TARIFFS[key]
    draft[key] = { days: String(t.days), green: String(t.green), yellow: String(t.yellow) }
  }
  return draft
}

function parseRow(row: { days: string; green: string; yellow: string }): TariffSetting | null {
  return validateTariffSetting({
    days: Number(row.days),
    green: Number(row.green),
    yellow: Number(row.yellow),
  })
}

function sameAs(draft: Draft, config: TariffConfig): boolean {
  return TARIFF_KEYS.every((key) => {
    const parsed = parseRow(draft[key])
    const current = config[key]
    return parsed != null && parsed.days === current.days && parsed.green === current.green && parsed.yellow === current.yellow
  })
}

/**
 * Tarif muddatlari va rang bosqichlari — admin panel orqali sozlanadi.
 *
 * MUHIM: o'zgarish faqat YANGI mahsulotlarga ta'sir qiladi. Mavjud
 * buyurtmalarning muddati yaratilganda hisoblanib, hujjatga yozib
 * qo'yilgan — aks holda sozlamani o'zgartirish butun sexdagi ishlarning
 * muddatini birdaniga surib yuborardi.
 */
function TariffSettingsCard() {
  const { tariffs, loading } = useTariffs()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Boshlang'ich qiymat bir marta — sozlama yuklangach. Keyingi jonli
  // yangilanishlar tahrirni yuvib yubormaydi.
  useEffect(() => {
    if (!loading) setDraft((current) => current ?? toDraft(tariffs))
  }, [loading, tariffs])

  const mutation = useMutation({
    mutationFn: (config: TariffConfig) => updateTariffs(config),
    onSuccess: (res) => {
      setDraft(toDraft(res.tariffs))
      setSaved(true)
      setError(null)
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Saqlab bo\'lmadi')
      setSaved(false)
    },
  })

  function setField(key: string, field: 'days' | 'green' | 'yellow', value: string) {
    setDraft((current) => (current ? { ...current, [key]: { ...current[key], [field]: value } } : current))
    setSaved(false)
    setError(null)
  }

  function save() {
    if (!draft) return
    const config: TariffConfig = {}
    for (const key of TARIFF_KEYS) {
      const parsed = parseRow(draft[key])
      if (!parsed) return
      config[key] = parsed
    }
    mutation.mutate(config)
  }

  const allValid = draft != null && TARIFF_KEYS.every((key) => parseRow(draft[key]) != null)
  const dirty = draft != null && !sameAs(draft, tariffs)

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
        <Clock3 size={18} className="text-brand-primary" />
        Tariflar
      </h2>
      <p className="mb-4 text-xs text-gray-dark">
        Muddat va rang bosqichlarini shu yerdan o'zgartirasiz. O'zgarish faqat{' '}
        <span className="font-bold text-ink">yangi qo'shiladigan mahsulotlarga</span> tegishli — mavjud
        buyurtmalarning muddati yaratilganda belgilangan va o'zgarmaydi.
      </p>

      {!draft ? (
        <Spinner className="py-10" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TARIFF_KEYS.map((key) => {
              const info = TARIFF_CONFIG[key]
              const row = draft[key]
              const parsed = parseRow(row)
              return (
                <div key={key} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{ color: info.color, backgroundColor: info.bg }}
                    >
                      {info.label}
                    </span>
                    <span className="text-xs font-bold text-ink">
                      {parsed ? `${parsed.days} kunlik` : '—'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-dark">{TARIFF_NOTES[key]}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <NumberField
                      label="Muddat"
                      value={row.days}
                      onChange={(v) => setField(key, 'days', v)}
                    />
                    <NumberField
                      label="Yashil"
                      value={row.green}
                      onChange={(v) => setField(key, 'green', v)}
                    />
                    <NumberField
                      label="Sariq"
                      value={row.yellow}
                      onChange={(v) => setField(key, 'yellow', v)}
                    />
                  </div>

                  {parsed ? (
                    <StagePreview setting={parsed} />
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-danger">
                      1 ≤ yashil &lt; sariq ≤ muddat bo'lishi kerak (muddat 1-365 kun)
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={!allValid || !dirty || mutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check size={15} />
              {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
            {dirty && (
              <button
                onClick={() => {
                  setDraft(toDraft(tariffs))
                  setError(null)
                  setSaved(false)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-bold text-gray-dark hover:text-ink"
              >
                <RotateCcw size={15} />
                Bekor qilish
              </button>
            )}
            {saved && !dirty && <span className="text-xs font-bold text-success">Saqlandi</span>}
            {error && <span className="text-xs font-bold text-danger">{error}</span>}
          </div>
        </>
      )}
    </section>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-dark">{label}</span>
      <input
        type="number"
        min={1}
        max={365}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-10 w-full rounded-lg border border-border bg-bg px-2 text-center text-sm font-bold text-ink outline-none focus:border-brand-primary"
      />
    </label>
  )
}

/**
 * Kun bo'linishi — chizma sifatida. Raqamlarning o'zidan nima
 * chiqishini ko'rsatadi: "2 kun yashil · 1 kun sariq · 1 kun qizil".
 */
function StagePreview({ setting }: { setting: TariffSetting }) {
  const stages = [
    { label: 'yashil', days: setting.green, color: '#1E9E5A' },
    { label: 'sariq', days: setting.yellow - setting.green, color: '#F59E0B' },
    { label: 'qizil', days: setting.days - setting.yellow, color: '#D64545' },
  ].filter((s) => s.days > 0)

  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full">
        {stages.map((s) => (
          <div key={s.label} style={{ flexGrow: s.days, backgroundColor: s.color }} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-dark">
        {stages.map((s) => `${s.days} kun ${s.label}`).join(' · ')}
      </p>
    </div>
  )
}

/**
 * Omborxona chegarasi. Qoida ilovada buyurtma xulosasidan hisoblanadi —
 * shu son o'zgarishi bilan ombor ro'yxati hamma xodimda darhol yangilanadi
 * (hech qanday buyurtma "ko'chirilmaydi", shuning uchun qaytarib
 * o'zgartirish ham xavfsiz).
 */
function WarehouseSettingsCard() {
  const [current, setCurrent] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeWarehouseDays((days) => {
        setCurrent(days)
        setDraft((d) => (d === '' ? String(days) : d))
      }),
    [],
  )

  const parsed = Number(draft)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 365
  const dirty = current !== null && valid && parsed !== current

  const mutation = useMutation({
    mutationFn: () => updateWarehouseDays(parsed),
    onSuccess: () => {
      setSaved(true)
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Saqlab bo'lmadi"),
  })

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
        <Warehouse size={18} className="text-brand-primary" />
        Omborxona
      </h2>
      <p className="mb-4 text-xs text-gray-dark">
        Barcha mahsulotlari tayyor buyurtma muddatidan shuncha kundan ko'p o'tsa (mijoz olib ketmasa), u
        dastavchikning "Tayyor" ro'yxatidan Omborxonaga o'tadi. Omborxonani vakolat berilgan xodimlar
        ko'radi — vakolat Xodimlar sahifasida beriladi.
      </p>

      {current === null ? (
        <Spinner className="py-6" />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-dark">Kechikish chegarasi (kun)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setSaved(false)
                setError(null)
              }}
              className="mt-1 block h-11 w-32 rounded-xl border border-border bg-bg px-3 text-center text-sm font-bold text-ink outline-none focus:border-brand-primary"
            />
          </label>
          <button
            onClick={() => mutation.mutate()}
            disabled={!dirty || mutation.isPending}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check size={15} />
            {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
          {!valid && <span className="text-xs font-bold text-danger">1 dan 365 gacha butun son</span>}
          {saved && !dirty && <span className="text-xs font-bold text-success">Saqlandi</span>}
          {error && <span className="text-xs font-bold text-danger">{error}</span>}
          {current === DEFAULT_WAREHOUSE_DAYS && !dirty && !saved && (
            <span className="text-xs text-gray-dark">Standart qiymat</span>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Bonus (keshbek) foizi. Yakunlangan har bir buyurtma uchun haqiqatda
 * olingan puldan (chegirma, ishlatilgan bonus va yopilmagan qarzsiz)
 * shuncha foiz mijoz hisobiga yoziladi; qarz keyin yopilsa — o'shanda.
 * O'zgarish keyingi yakunlanadigan buyurtmalardan boshlab kuchga kiradi.
 */
function BonusSettingsCard() {
  const [current, setCurrent] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeBonusPercent((percent) => {
        setCurrent(percent)
        setDraft((d) => (d === '' ? String(percent) : d))
      }),
    [],
  )

  const parsed = Number(draft.replace(',', '.'))
  const valid = draft.trim() !== '' && isValidBonusPercent(parsed)
  const dirty = current !== null && valid && parsed !== current

  const mutation = useMutation({
    mutationFn: () => updateBonusPercent(parsed),
    onSuccess: () => {
      setSaved(true)
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Saqlab bo'lmadi"),
  })

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
        <Gift size={18} className="text-brand-primary" />
        Bonus (keshbek)
      </h2>
      <p className="mb-4 text-xs text-gray-dark">
        Yakunlangan har bir buyurtma uchun mijozdan haqiqatda olingan puldan shuncha foiz uning bonus hisobiga
        yoziladi. Mijoz keyingi buyurtmalarida bonusni chegirma sifatida ishlatishi mumkin. 0 — bonus berish to'xtatiladi.
      </p>

      {current === null ? (
        <Spinner className="py-6" />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-dark">Foiz (%)</span>
            <input
              inputMode="decimal"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setSaved(false)
                setError(null)
              }}
              className="mt-1 block h-11 w-32 rounded-xl border border-border bg-bg px-3 text-center text-sm font-bold text-ink outline-none focus:border-brand-primary"
            />
          </label>
          <button
            onClick={() => mutation.mutate()}
            disabled={!dirty || mutation.isPending}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check size={15} />
            {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
          {!valid && <span className="text-xs font-bold text-danger">0 dan {MAX_BONUS_PERCENT} gacha</span>}
          {saved && !dirty && <span className="text-xs font-bold text-success">Saqlandi</span>}
          {error && <span className="text-xs font-bold text-danger">{error}</span>}
          {current === DEFAULT_BONUS_PERCENT && !dirty && !saved && (
            <span className="text-xs text-gray-dark">Standart qiymat</span>
          )}
        </div>
      )}
    </section>
  )
}

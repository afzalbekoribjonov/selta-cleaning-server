import { useState, type FormEvent } from 'react'
import { Mail, ShieldCheck, Info, Clock3, KeyRound } from 'lucide-react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '@/lib/auth-context'
import { TARIFF_CONFIG } from '@/lib/status-config'
import { SALARY_METHODS } from '@/lib/salary-methods'

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

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-heading font-bold text-ink">
          <ShieldCheck size={18} className="text-brand-primary" />
          Admin hisobi
        </h2>
        <div className="flex items-center gap-3 rounded-xl bg-bg p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <Mail size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">{user?.email ?? '—'}</div>
            <div className="text-xs text-gray-dark">Administrator</div>
          </div>
        </div>
      </section>

      <ChangePasswordCard />

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
          <Clock3 size={18} className="text-brand-primary" />
          Tariflar
        </h2>
        <p className="mb-4 text-xs text-gray-dark">
          Har bir tarifning muddati biznes qoidalari bilan belgilangan va bu yerdan o'zgartirilmaydi.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(TARIFF_CONFIG).map(([key, t]) => (
            <div key={key} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{ color: t.color, backgroundColor: t.bg }}
                >
                  {t.label}
                </span>
                <span className="text-sm font-bold text-ink">{t.days}</span>
              </div>
              <p className="mt-2 text-xs text-gray-dark">{TARIFF_NOTES[key]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
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
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
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

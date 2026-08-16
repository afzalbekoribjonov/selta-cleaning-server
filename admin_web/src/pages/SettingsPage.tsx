import { Mail, ShieldCheck, Info, Clock3 } from 'lucide-react'
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

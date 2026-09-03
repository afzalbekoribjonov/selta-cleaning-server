import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Delete, ArrowLeft } from 'lucide-react'
import { listWorkers, loginWithPin, type EmployeeSummary } from '@/lib/auth'
import { describeApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { SeltaLoader } from '@/components/SeltaLoader'

/**
 * Mobil-birinchi kirish ekrani (asosan iPhone Safari uchun). Ilovadagi
 * PIN oqimi bilan bir xil: ism tanlash -> 4 xonali PIN -> avtomatik
 * kirish. Sessiya `browserLocalPersistence` bilan saqlanadi, shuning
 * uchun bu ekran faqat birinchi marta va chiqishdan keyin ko'rinadi.
 */
export default function LoginPage() {
  const { user, claims, loading } = useAuth()
  const [employees, setEmployees] = useState<EmployeeSummary[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [selected, setSelected] = useState<EmployeeSummary | null>(null)

  const load = useCallback(() => {
    setListError(null)
    setEmployees(null)
    listWorkers()
      .then(setEmployees)
      .catch((e) => setListError(describeApiError(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (!loading && user && claims) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-brand-primary to-brand-primary-dark">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="absolute -right-20 top-1/4 h-56 w-56 rounded-full bg-white/[0.05]" />
        <div className="absolute -bottom-28 left-1/4 h-80 w-80 rounded-full bg-brand-accent/[0.08]" />
      </div>

      <div className="relative flex flex-col items-center px-6 pb-6 pt-safe">
        <div className="mt-10 flex flex-col items-center text-center">
          <img src="/brand/icon_white.png" alt="Selta Cleaning" className="h-16 w-16" />
          <h1 className="mt-3 font-heading text-xl font-extrabold text-white">Selta Cleaning</h1>
          <p className="mt-0.5 text-sm text-white/60">Ishchi paneli</p>
        </div>
      </div>

      <div className="relative flex-1 rounded-t-[28px] bg-bg px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
        {selected ? (
          <PinStep employee={selected} onBack={() => setSelected(null)} />
        ) : (
          <EmployeeStep employees={employees} error={listError} onRetry={load} onSelect={setSelected} />
        )}
      </div>
    </div>
  )
}

function EmployeeStep({
  employees,
  error,
  onRetry,
  onSelect,
}: {
  employees: EmployeeSummary[] | null
  error: string | null
  onRetry: () => void
  onSelect: (e: EmployeeSummary) => void
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <h2 className="font-heading text-lg font-extrabold text-ink">Xush kelibsiz</h2>
      <p className="mt-0.5 text-sm text-gray-dark">Davom etish uchun ismingizni tanlang</p>

      <div className="mt-5">
        {error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface py-10 text-center">
            <p className="px-6 text-sm font-semibold text-danger">{error}</p>
            <button
              onClick={onRetry}
              className="h-11 rounded-2xl border border-border px-5 text-sm font-bold text-ink active:scale-95"
            >
              Qayta urinish
            </button>
          </div>
        ) : employees === null ? (
          <SeltaLoader label="Yuklanmoqda..." className="py-14" />
        ) : employees.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface py-10 text-center text-sm text-gray-dark">
            Ishchi bo'limida hali xodim yo'q
          </p>
        ) : (
          <div className="space-y-2.5">
            {employees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => onSelect(emp)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 text-left active:scale-[0.99]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-base font-extrabold text-white">
                  {emp.fullName.charAt(0).toUpperCase()}
                </div>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{emp.fullName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const PIN_LENGTH = 4

function PinStep({ employee, onBack }: { employee: EmployeeSummary; onBack: () => void }) {
  const [pin, setPin] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    async (fullPin: string) => {
      setChecking(true)
      try {
        await loginWithPin(employee.id, fullPin)
      } catch (e) {
        setError(describeApiError(e))
        setChecking(false)
        setPin('')
        // Xato bo'lganda qisqa tebranish — barmoq bilan ishlashda
        // ekранga qaramasdan ham sezilishi uchun.
        navigator.vibrate?.(120)
      }
    },
    [employee.id],
  )

  const press = useCallback(
    (n: number) => {
      if (checking) return
      navigator.vibrate?.(8)
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev
        const next = prev + n.toString()
        setError(null)
        if (next.length === PIN_LENGTH) {
          window.setTimeout(() => submit(next), 120)
        }
        return next
      })
    },
    [checking, submit],
  )

  const backspace = useCallback(() => {
    if (checking) return
    setPin((prev) => prev.slice(0, -1))
  }, [checking])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') press(Number(e.key))
      else if (e.key === 'Backspace') backspace()
      else if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [press, backspace, onBack])

  return (
    <div className="mx-auto w-full max-w-xs">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-xs font-bold text-gray-dark active:scale-95">
        <ArrowLeft size={15} />
        Orqaga
      </button>

      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-2xl font-extrabold text-white">
          {employee.fullName.charAt(0).toUpperCase()}
        </div>
        <p className="mt-2.5 font-heading text-base font-extrabold text-ink">{employee.fullName}</p>
        <p className={`mt-1 text-xs font-semibold ${error ? 'text-danger' : 'text-gray-dark'}`}>
          {error ?? `${PIN_LENGTH} xonali PIN kodingizni kiriting`}
        </p>

        <div className="my-6 flex gap-3.5">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
                i < pin.length ? 'border-brand-primary bg-brand-primary' : 'border-border bg-transparent'
              }`}
            />
          ))}
        </div>

        {checking ? (
          <SeltaLoader label="Tekshirilmoqda..." className="py-6" />
        ) : (
          <div className="grid w-full grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <PadButton key={n} label={n.toString()} onClick={() => press(n)} />
            ))}
            <div />
            <PadButton label="0" onClick={() => press(0)} />
            <button
              onClick={backspace}
              aria-label="O'chirish"
              className="flex h-16 items-center justify-center rounded-2xl bg-surface text-gray-dark active:scale-95"
            >
              <Delete size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-16 rounded-2xl bg-surface text-2xl font-bold text-ink shadow-sm active:scale-95 active:bg-brand-primary/10"
    >
      {label}
    </button>
  )
}

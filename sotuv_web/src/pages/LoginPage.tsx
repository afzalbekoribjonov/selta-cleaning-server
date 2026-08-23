import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Delete, ArrowLeft, PlusCircle, ListChecks, Search, Keyboard } from 'lucide-react'
import { listDispatchers, loginWithPin, type EmployeeSummary } from '@/lib/auth'
import { describeApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

const FEATURES = [
  { icon: PlusCircle, text: 'Buyurtmani bir necha soniyada rasmiylashtiring' },
  { icon: ListChecks, text: 'Faol buyurtmalarni holati bo\'yicha kuzatib boring' },
  { icon: Search, text: 'Mijozning barcha buyurtmalarini topib oling' },
]

export default function LoginPage() {
  const { user, claims, loading } = useAuth()
  const [employees, setEmployees] = useState<EmployeeSummary[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [selected, setSelected] = useState<EmployeeSummary | null>(null)

  const load = useCallback(() => {
    setListError(null)
    setEmployees(null)
    listDispatchers()
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
    <div className="flex h-screen overflow-hidden bg-surface">
      <div className="relative hidden w-[42%] shrink-0 overflow-hidden bg-gradient-to-br from-brand-primary to-brand-primary-dark lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/[0.06]" />
          <div className="absolute -right-16 top-1/3 h-64 w-64 rounded-full bg-white/[0.05]" />
          <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-brand-accent/[0.08]" />
        </div>

        <div className="relative px-14 pt-14">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl font-extrabold text-white">
            S
          </div>
        </div>

        <div className="relative px-14">
          <h1 className="font-heading text-[34px] font-extrabold leading-tight text-white">
            Selta Cleaning
            <br />
            Sotuv menejeri paneli
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Kompyuterdan qulay tarzda yangi buyurtma qabul qiling va mijozlar bilan ishlashni tezlashtiring.
          </p>

          <div className="mt-9 space-y-4">
            {FEATURES.map((f) => (
              <div key={f.text} className="flex items-center gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                  <f.icon size={17} />
                </div>
                <span className="text-sm font-medium text-white/80">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative px-14 pb-10">
          <p className="text-xs font-semibold text-white/35">© {new Date().getFullYear()} Selta Cleaning</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-lg font-extrabold text-white">
              S
            </div>
            <div>
              <p className="font-heading text-sm font-extrabold text-ink">Selta Cleaning</p>
              <p className="text-xs font-semibold text-gray-dark">Sotuv menejeri paneli</p>
            </div>
          </div>

          {selected ? (
            <PinStep employee={selected} onBack={() => setSelected(null)} />
          ) : (
            <EmployeeStep employees={employees} error={listError} onRetry={load} onSelect={setSelected} />
          )}
        </div>
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
    <div>
      <h2 className="font-heading text-2xl font-extrabold text-ink">Xush kelibsiz</h2>
      <p className="mt-1.5 text-sm text-gray-dark">Davom etish uchun ismingizni tanlang</p>

      <div className="mt-8">
        {error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-bg py-10 text-center">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button
              onClick={onRetry}
              className="rounded-xl border border-border bg-surface px-5 py-2 text-sm font-bold text-ink hover:bg-bg"
            >
              Qayta urinish
            </button>
          </div>
        ) : employees === null ? (
          <div className="flex justify-center py-14">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-primary/20 border-t-brand-primary" />
          </div>
        ) : employees.length === 0 ? (
          <p className="rounded-2xl border border-border bg-bg py-10 text-center text-sm text-gray-dark">
            Hali sotuv menejeri bo'limida xodim yo'q — admin panel orqali qo'shiladi
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {employees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => onSelect(emp)}
                className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface px-3 py-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-base font-extrabold text-white">
                  {emp.fullName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold leading-tight text-ink">{emp.fullName}</span>
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
      }
    },
    [employee.id],
  )

  const press = useCallback(
    (n: number) => {
      if (checking) return
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
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-xs font-bold text-gray-dark hover:text-ink"
      >
        <ArrowLeft size={14} />
        Orqaga
      </button>

      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-2xl font-extrabold text-white">
          {employee.fullName.charAt(0).toUpperCase()}
        </div>
        <p className="font-heading text-lg font-extrabold text-ink">{employee.fullName}</p>
        <p className={`mt-1 text-xs font-semibold ${error ? 'text-danger' : 'text-gray-dark'}`}>
          {error ?? `${PIN_LENGTH} xonali PIN kodingizni kiriting`}
        </p>

        <div className="my-7 flex gap-3.5">
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
          <div className="py-8">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-primary/20 border-t-brand-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <PadButton key={n} label={n.toString()} onClick={() => press(n)} />
              ))}
              <div />
              <PadButton label="0" onClick={() => press(0)} />
              <button
                onClick={backspace}
                className="flex items-center justify-center rounded-2xl bg-bg text-gray-dark transition-colors hover:bg-brand-primary/10 hover:text-brand-primary"
              >
                <Delete size={18} />
              </button>
            </div>
            <p className="mt-6 flex items-center gap-1.5 text-[11px] font-semibold text-gray-dark">
              <Keyboard size={13} />
              Klaviaturadan raqam kiritishingiz ham mumkin
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function PadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-14 w-14 rounded-2xl bg-bg text-lg font-bold text-ink transition-colors hover:bg-brand-primary/10 hover:text-brand-primary"
    >
      {label}
    </button>
  )
}

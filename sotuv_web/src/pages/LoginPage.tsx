import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Delete } from 'lucide-react'
import { listDispatchers, loginWithPin, type EmployeeSummary } from '@/lib/auth'
import { describeApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-primary to-brand-primary-dark px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-9 shadow-2xl backdrop-blur-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-extrabold text-white">
            S
          </div>
          <h1 className="font-heading text-xl font-extrabold text-white">Selta Cleaning</h1>
          <p className="mt-1 text-sm text-white/60">Sotuv menejeri paneli</p>
        </div>

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
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm font-semibold text-white/80">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-xl border border-white/20 px-5 py-2 text-sm font-bold text-white hover:bg-white/10"
        >
          Qayta urinish
        </button>
      </div>
    )
  }

  if (employees === null) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-white/70">
        Hali sotuv menejeri bo'limida xodim yo'q — admin panel orqali qo'shiladi
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      <p className="mb-4 text-center text-xs font-bold uppercase tracking-wide text-white/50">Ismingizni tanlang</p>
      {employees.map((emp) => (
        <button
          key={emp.id}
          onClick={() => onSelect(emp)}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left transition-colors hover:border-white/25 hover:bg-white/10"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent to-amber-400 text-base font-extrabold text-brand-primary-dark">
            {emp.fullName.charAt(0).toUpperCase()}
          </div>
          <span className="font-bold text-white">{emp.fullName}</span>
        </button>
      ))}
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
    <div className="flex flex-col items-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl font-extrabold text-white">
        {employee.fullName.charAt(0).toUpperCase()}
      </div>
      <p className="text-base font-extrabold text-white">{employee.fullName}</p>
      <p className={`mt-1.5 text-center text-xs font-semibold ${error ? 'text-brand-accent' : 'text-white/50'}`}>
        {error ?? `${PIN_LENGTH} xonali PIN kodingizni kiriting`}
      </p>

      <div className="my-6 flex gap-3">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 border-white/40 ${i < pin.length ? 'bg-white' : 'bg-transparent'}`}
          />
        ))}
      </div>

      {checking ? (
        <div className="py-6">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <PadButton key={n} label={n.toString()} onClick={() => press(n)} />
          ))}
          <button onClick={onBack} className="rounded-2xl text-xs font-bold text-white/50 hover:text-white/80">
            Orqaga
          </button>
          <PadButton label="0" onClick={() => press(0)} />
          <button
            onClick={backspace}
            className="flex items-center justify-center rounded-2xl bg-white/[0.06] py-4 text-white/60 hover:bg-white/10"
          >
            <Delete size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

function PadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl bg-white/[0.06] py-4 text-lg font-bold text-white transition-colors hover:bg-white/10"
    >
      {label}
    </button>
  )
}

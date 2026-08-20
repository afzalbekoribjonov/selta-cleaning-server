import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Plus, X, Trash2 } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Advance } from '@/lib/advances'
import { type Employee } from '@/lib/employees'
import { useEmployeeAdvances } from '@/hooks/useEmployeeAdvances'
import { formatDateUz, UZ_MONTHS_FULL } from '@/lib/date-utils'
import { Spinner } from '@/components/ui/Spinner'
import { useEscapeClose } from '@/hooks/useEscapeClose'

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}${Math.round(Math.abs(value)).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `${UZ_MONTHS_FULL[(m ?? 1) - 1]} ${y}`
}

/**
 * Xodimga berilgan avanslar tarixi — profil sahifasida (talab: "oylik
 * maoshning bir qismini avans sifatida berish"). "Oylik hisobot"da
 * hisoblangan har bir oy uchun avanslar yig'indisi avtomatik ayiriladi
 * (server/src/routes/payroll.ts), bu yerda esa faqat kiritish/tarix.
 */
export function AdvancesSection({ employee }: { employee: Employee }) {
  const { advances, loading } = useEmployeeAdvances(employee.id)
  const [giveOpen, setGiveOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Advance | null>(null)
  const terminated = employee.status !== 'active'

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Avanslar</h2>
        </div>
        {!terminated && (
          <button
            onClick={() => setGiveOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
          >
            <Plus size={14} />
            Avans berish
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-dark">
        Berilgan avanslar shu oy uchun hisoblangan maoshdan avtomatik ayiriladi
      </p>

      {loading ? (
        <Spinner className="py-8" />
      ) : advances.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-dark">Hali avans berilmagan</p>
      ) : (
        <div className="space-y-2">
          {advances.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-bg p-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{formatMoney(a.amount)}</span>
                  <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">
                    {monthLabel(a.yearMonth)}
                  </span>
                </div>
                {a.note && <p className="mt-1 text-xs text-gray-dark">{a.note}</p>}
                <p className="mt-1 text-[11px] text-gray-dark">{formatDateUz(a.createdAt)}</p>
              </div>
              <button
                title="O'chirish"
                onClick={() => setDeleteTarget(a)}
                className="shrink-0 rounded-lg p-1.5 text-gray-dark hover:bg-danger-bg hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {giveOpen && <GiveAdvanceDialog employeeId={employee.id} onClose={() => setGiveOpen(false)} />}
      {deleteTarget && (
        <DeleteAdvanceDialog employeeId={employee.id} advance={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </section>
  )
}

function GiveAdvanceDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/adminGiveAdvance', {
        employeeId,
        amount: Number(amount),
        yearMonth,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!(Number(amount) > 0)) {
      setError("Summa musbat son bo'lishi kerak")
      return
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">Avans berish</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Summa (so'm)</label>
            <input
              autoFocus
              type="number"
              min={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Qaysi oy hisobidan</label>
            <input
              type="month"
              required
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
            <p className="mt-1 text-xs text-gray-dark">Shu oy uchun hisoblangan maoshdan ayiriladi</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Izoh (ixtiyoriy)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: naqd berildi"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {mutation.isPending ? 'Saqlanmoqda...' : 'Berish'}
          </button>
        </form>
      </div>
    </div>
  )
}

function DeleteAdvanceDialog({
  employeeId,
  advance,
  onClose,
}: {
  employeeId: string
  advance: Advance
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminDeleteAdvance', { employeeId, advanceId: advance.id }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-heading font-bold text-ink">Avansni o'chirish</h2>
        <p className="mt-2 text-sm text-gray-dark">
          <strong className="text-ink">{formatMoney(advance.amount)}</strong> ({monthLabel(advance.yearMonth)}) o'chirilsinmi?
        </p>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
            Bekor qilish
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {mutation.isPending ? '...' : "O'chirish"}
          </button>
        </div>
      </div>
    </div>
  )
}

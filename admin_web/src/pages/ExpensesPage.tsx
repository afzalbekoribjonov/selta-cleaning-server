import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus, X, Pencil, Trash2, Receipt, Repeat, TrendingDown, PieChart } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useExpenses } from '@/hooks/useExpenses'
import { computeMonthlyExpenses, type Expense } from '@/lib/expenses'
import { UZ_MONTHS_SHORT, formatDateUz } from '@/lib/date-utils'
import { Spinner } from '@/components/ui/Spinner'
import { useEscapeClose } from '@/hooks/useEscapeClose'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ExpensesPage() {
  const { expenses, loading } = useExpenses()
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  const trend = useMemo(() => {
    if (!expenses) return []
    const now = new Date()
    const months: { year: number; month: number; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth(), label: UZ_MONTHS_SHORT[d.getMonth()] })
    }
    return months.map(({ year, month, label }) => ({
      label,
      total: computeMonthlyExpenses(expenses, year, month).total,
    }))
  }, [expenses])

  const categories = useMemo(() => {
    if (!expenses) return []
    const now = new Date()
    const { items } = computeMonthlyExpenses(expenses, now.getFullYear(), now.getMonth())
    const tally: Record<string, number> = {}
    for (const e of items) tally[e.name] = (tally[e.name] ?? 0) + e.amount
    return Object.entries(tally)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
  }, [expenses])

  const thisMonthTotal = trend.length > 0 ? trend[trend.length - 1].total : 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Chiqimlar</h1>
          <p className="mt-1 text-sm text-gray-dark">Maoshdan tashqari xarajatlar — bir martalik yoki oyma-oy takrorlanuvchi</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm"
        >
          <Plus size={18} />
          Yangi chiqim
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm xl:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown size={18} className="text-danger" />
              <h2 className="font-heading font-bold text-ink">Oylik chiqim tendensiyasi</h2>
            </div>
            {!loading && (
              <span className="rounded-full bg-danger-bg px-2.5 py-1 text-xs font-bold text-danger">
                Shu oy: {formatMoney(thisMonthTotal)}
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-gray-dark">Oxirgi 6 oy (takrorlanuvchi chiqimlar avtomatik hisoblanadi)</p>

          {loading ? (
            <Spinner className="py-16" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 12 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }}
                  width={40}
                  tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-bg)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as { label: string; total: number }
                    return (
                      <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg">
                        <div className="text-xs font-bold text-ink">{row.label}</div>
                        <div className="mt-0.5 text-sm font-extrabold text-danger">{formatMoney(row.total)}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="total" fill="var(--color-danger)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <PieChart size={18} className="text-danger" />
            <h2 className="font-heading font-bold text-ink">Shu oy — turlari bo'yicha</h2>
          </div>
          <p className="mb-4 text-xs text-gray-dark">Eng katta chiqim manbalari</p>

          {loading ? (
            <Spinner className="py-16" />
          ) : categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-dark">Shu oy chiqim yo'q</p>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const max = Math.max(...categories.map((c) => c.amount), 1)
                return categories.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{c.name}</span>
                      <span className="font-bold text-gray-dark">{formatMoney(c.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg">
                      <div className="h-full rounded-full bg-danger" style={{ width: `${Math.max((c.amount / max) * 100, 4)}%` }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        {loading && <Spinner className="p-8" />}
        {!loading && expenses && expenses.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Receipt className="text-gray" size={40} />
            <p className="font-semibold text-ink">Hali chiqim yo'q</p>
            <p className="text-sm text-gray-dark">"Yangi chiqim" tugmasi orqali qo'shing</p>
          </div>
        )}
        {!loading && expenses && expenses.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-gray-dark">
                  <th className="px-5 py-3 font-semibold">Nomi</th>
                  <th className="px-5 py-3 font-semibold">Sana</th>
                  <th className="px-5 py-3 font-semibold">Turi</th>
                  <th className="px-5 py-3 font-semibold">Summa</th>
                  <th className="px-5 py-3 font-semibold text-right">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-semibold text-ink">{e.name}</td>
                    <td className="px-5 py-3 text-ink">{formatDateUz(e.date)}</td>
                    <td className="px-5 py-3">
                      {e.recurring ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                          <Repeat size={11} />
                          Har oy
                        </span>
                      ) : (
                        <span className="text-xs text-gray-dark">Bir martalik</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-bold text-danger">{formatMoney(e.amount)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          title="Tahrirlash"
                          onClick={() => setEditTarget(e)}
                          className="rounded-lg p-2 text-gray-dark transition-colors hover:bg-brand-primary/10 hover:text-brand-primary"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          title="O'chirish"
                          onClick={() => setDeleteTarget(e)}
                          className="rounded-lg p-2 text-gray-dark transition-colors hover:bg-danger-bg hover:text-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && <ExpenseFormDialog onClose={() => setFormOpen(false)} />}
      {editTarget && <ExpenseFormDialog expense={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteExpenseDialog expense={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}

function ExpenseFormDialog({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const editing = !!expense
  const [name, setName] = useState(expense?.name ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [date, setDate] = useState(
    expense ? `${expense.date.getFullYear()}-${String(expense.date.getMonth() + 1).padStart(2, '0')}-${String(expense.date.getDate()).padStart(2, '0')}` : todayIso(),
  )
  const [recurring, setRecurring] = useState(expense?.recurring ?? false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), amount: Number(amount) || 0, date, recurring }
      if (editing) return apiPost('/adminUpdateExpense', { ...body, expenseId: expense!.id })
      return apiPost('/adminCreateExpense', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Chiqim nomini kiriting')
      return
    }
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
          <h2 className="text-lg font-heading font-bold text-ink">{editing ? 'Chiqimni tahrirlash' : 'Yangi chiqim'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Chiqim nomi</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Ijaraq, Kommunal to'lov"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Summa (so'm)</label>
            <input
              type="number"
              min={0}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">{recurring ? 'Boshlanish sanasi' : 'Sana'}</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-brand-primary" />
            <div>
              <div className="text-sm font-bold text-ink">Har oy takrorlanadi</div>
              <div className="text-xs text-gray-dark">Yuqoridagi sanadan boshlab, har oy avtomatik hisoblanadi</div>
            </div>
          </label>

          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </form>
      </div>
    </div>
  )
}

function DeleteExpenseDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminDeleteExpense', { expenseId: expense.id }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-heading font-bold text-ink">Chiqimni o'chirish</h2>
        <p className="mt-2 text-sm text-gray-dark">
          <strong className="text-ink">{expense.name}</strong> o'chirilsinmi?
          {expense.recurring && ' Bu takrorlanuvchi chiqim — o‘chirilgach keyingi oylarda hisoblanmaydi.'}
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

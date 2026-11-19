import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CalendarRange,
  Pencil,
  PieChart,
  Plus,
  Receipt,
  Repeat,
  Sigma,
  Trash2,
  TrendingDown,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useExpensesInRange } from '@/hooks/useExpenses'
import { expenseKindKey, fetchMonthTotals, type Expense, type ExpenseEntry } from '@/lib/expenses'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'
import { UZ_WEEKDAYS, addDays, daysInRange, formatRange, isDateKey, monthLabel, monthRange, shiftMonth, todayKey, weekdayIndex, type DateRange } from '@/lib/uz-dates'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { KpiTile } from '@/components/ui/KpiTile'
import { Panel, Segmented } from '@/components/ui/Panel'
import { PeriodPicker } from '@/components/ui/PeriodPicker'
import { DailyChart, ExpenseCalendar, KindsList, MonthsChart } from '@/components/expenses/ExpenseViews'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Source = 'all' | 'staff' | 'admin' | 'recurring'

const SOURCE_FILTERS: Record<Source, (e: Expense) => boolean> = {
  all: () => true,
  staff: (e) => !!e.employeeId,
  admin: (e) => !e.employeeId && !e.recurring,
  recurring: (e) => e.recurring,
}

/**
 * Chiqimlar — tanlangan davr (kun, oraliq yoki oy) bo'yicha: oylar va
 * kunlar grafigi, o'zbekcha kalendar (qaysi kuni qancha), turlari va
 * kunlarga ajratilgan ro'yxat. Faqat shu davr hujjatlari o'qiladi;
 * 12 oylik grafik — hujjatlarsiz yig'ma so'rovlar (sum).
 */
export default function ExpensesPage() {
  const [params, setParams] = useSearchParams()
  const today = todayKey()
  const range = useMemo<DateRange>(() => {
    const from = params.get('from')
    const to = params.get('to')
    if (isDateKey(from) && isDateKey(to) && from <= to && to <= today) return { from, to }
    return monthRange(today.slice(0, 7), today)
  }, [params, today])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('all')
  const setRange = (r: DateRange) => {
    setSelectedDay(null)
    setKind(null)
    setParams({ from: r.from, to: r.to }, { replace: true })
  }

  const { entries, recurring, loading, error } = useExpensesInRange(range)
  const employeeNames = useEmployeesMap()
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  // 12 oylik grafik: tanlangan davr oxirigacha.
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(range.to.slice(0, 7), i - 11)), [range.to])
  const recurringKey = (recurring ?? []).map((e) => `${e.id}:${e.amount}:${e.date.getTime()}`).join(',')
  const monthTotals = useQuery({
    queryKey: ['expenseMonthTotals', months[0], months[11], recurringKey],
    queryFn: () => fetchMonthTotals(months, recurring ?? []),
    enabled: recurring !== null,
    staleTime: 5 * 60_000,
  })
  const activeMonths = useMemo(() => {
    const set = new Set<string>()
    for (const ym of months) if (ym >= range.from.slice(0, 7) && ym <= range.to.slice(0, 7)) set.add(ym)
    return set
  }, [months, range])

  const all = entries ?? []
  const bySource = all.filter((x) => SOURCE_FILTERS[source](x.expense))

  const dayTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of bySource) m.set(x.dayKey, (m.get(x.dayKey) ?? 0) + x.expense.amount)
    return m
  }, [bySource])

  const kinds = useMemo(() => {
    const m = new Map<string, { key: string; name: string; amount: number; count: number }>()
    for (const x of bySource) {
      const key = expenseKindKey(x.expense.name)
      const k = m.get(key) ?? { key, name: x.expense.name.trim(), amount: 0, count: 0 }
      k.amount += x.expense.amount
      k.count += 1
      m.set(key, k)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [bySource])

  const total = bySource.reduce((s, x) => s + x.expense.amount, 0)
  const staff = all.filter((x) => x.expense.employeeId)
  const staffCash = staff.filter((x) => x.expense.fromCash).reduce((s, x) => s + x.expense.amount, 0)
  const recurringInRange = all.filter((x) => x.expense.recurring)
  const elapsedDays = daysInRange({ from: range.from, to: range.to > today ? today : range.to })
  const peakDay = [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0]

  const visible = bySource.filter((x) => (!selectedDay || x.dayKey === selectedDay) && (!kind || expenseKindKey(x.expense.name) === kind))
  const groups = useMemo(() => {
    const m = new Map<string, ExpenseEntry[]>()
    for (const x of visible) m.set(x.dayKey, [...(m.get(x.dayKey) ?? []), x])
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [visible])

  const toggleDay = (key: string) => setSelectedDay((d) => (d === key ? null : key))
  const dayTitle = (key: string) => `${Number(key.slice(8))}-${monthLabel(key.slice(0, 7)).split(' ')[0].toLowerCase()}`

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Chiqimlar</h1>
          <p className="mt-1 text-sm text-gray-dark">Qaysi oyda, qaysi kuni, nimaga qancha sarflangan</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PeriodPicker value={range} onChange={setRange} maxDays={93} className="min-w-0" />
          <button
            onClick={() => setFormOpen(true)}
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-primary-dark"
          >
            <Plus size={17} />
            Yangi chiqim
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-bg/60 px-4 py-3 text-sm font-semibold text-danger">
          <AlertTriangle size={16} />
          Chiqimlarni yuklab bo'lmadi. Sahifani yangilang.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Sigma} tone="danger" label={`Jami — ${formatRange(range)}`} value={loading ? '…' : formatMoney(total)} sub={`${bySource.length} ta yozuv`} />
        <KpiTile
          icon={CalendarDays}
          label="Kunlik o'rtacha"
          value={loading ? '…' : formatMoney(total / Math.max(elapsedDays, 1))}
          sub={peakDay ? `Eng ko'p: ${dayTitle(peakDay[0])} — ${formatMoney(peakDay[1])}` : '—'}
        />
        <KpiTile
          icon={Users}
          tone="info"
          label="Xodimlar kiritgan"
          value={loading ? '…' : formatMoney(staff.reduce((s, x) => s + x.expense.amount, 0))}
          sub={staffCash > 0 ? `Qo'lidagi naqddan: ${formatMoney(staffCash)}` : `${staff.length} ta yozuv`}
          subTone={staffCash > 0 ? 'warning' : undefined}
        />
        <KpiTile
          icon={Repeat}
          label="Doimiy (har oy)"
          value={loading ? '…' : formatMoney(recurringInRange.reduce((s, x) => s + x.expense.amount, 0))}
          sub={`${recurringInRange.length} ta to'lov`}
        />
      </div>

      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Oylar kesimida" subtitle="Oxirgi 12 oy — oyni bosib tanlang" icon={TrendingDown}>
          <MonthsChart months={months} totals={monthTotals.data} activeMonths={activeMonths} onPick={(ym) => setRange(monthRange(ym, today))} />
        </Panel>
        <Panel title="Turlari bo'yicha" subtitle="Bosilsa — ro'yxat shu tur bilan cheklanadi" icon={PieChart}>
          <KindsList kinds={kinds.slice(0, 8)} total={total} active={kind} onToggle={(k) => setKind((v) => (v === k ? null : k))} />
        </Panel>
      </div>

      <Panel
        title="Kalendar"
        subtitle="Qaysi kuni qancha — kunni bosib ro'yxatni oching"
        icon={CalendarRange}
        actions={
          <Segmented<Source>
            value={source}
            onChange={setSource}
            options={[
              { value: 'all', label: 'Hammasi' },
              { value: 'staff', label: 'Xodimlar' },
              { value: 'admin', label: 'Admin' },
              { value: 'recurring', label: 'Doimiy' },
            ]}
          />
        }
      >
        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-bg" />
        ) : (
          <div className="space-y-6">
            {daysInRange(range) > 1 && <DailyChart range={range} totals={dayTotals} selected={selectedDay} onSelect={toggleDay} />}
            <ExpenseCalendar range={range} totals={dayTotals} selected={selectedDay} onSelect={toggleDay} />
          </div>
        )}
      </Panel>

      <Panel
        title="Ro'yxat"
        subtitle={`${visible.length} ta · ${formatMoney(visible.reduce((s, x) => s + x.expense.amount, 0))}`}
        icon={Receipt}
        actions={
          (selectedDay || kind) && (
            <div className="flex flex-wrap gap-1.5">
              {selectedDay && <FilterChip label={dayTitle(selectedDay)} onClear={() => setSelectedDay(null)} />}
              {kind && <FilterChip label={kinds.find((k) => k.key === kind)?.name ?? kind} onClear={() => setKind(null)} />}
            </div>
          )
        }
      >
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-bg" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Receipt className="text-gray" size={36} />
            <p className="font-semibold text-ink">Bu davrda chiqim yo'q</p>
            <p className="text-sm text-gray-dark">Boshqa davrni tanlang yoki "Yangi chiqim" qo'shing</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([day, list]) => (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                  <h3 className="text-sm font-extrabold text-ink">
                    {dayTitle(day)}
                    <span className="ml-1.5 font-semibold text-gray-dark">
                      {day === today ? 'bugun' : day === addDays(today, -1) ? 'kecha' : UZ_WEEKDAYS[weekdayIndex(day)].toLowerCase()}
                    </span>
                  </h3>
                  <span className="shrink-0 text-xs font-bold text-gray-dark">
                    {list.length} ta · <span className="text-danger">{formatMoney(list.reduce((s, x) => s + x.expense.amount, 0))}</span>
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {list.map((x) => (
                    <ExpenseRow
                      key={`${x.expense.id}:${x.dayKey}`}
                      expense={x.expense}
                      names={employeeNames}
                      onEdit={() => setEditTarget(x.expense)}
                      onDelete={() => setDeleteTarget(x.expense)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>

      {formOpen && <ExpenseFormDialog onClose={() => setFormOpen(false)} />}
      {editTarget && <ExpenseFormDialog expense={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteExpenseDialog expense={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white hover:bg-ink/80"
      title="Filtrni olib tashlash"
    >
      {label}
      <X size={12} />
    </button>
  )
}

function ExpenseRow({
  expense: e,
  names,
  onEdit,
  onDelete,
}: {
  expense: Expense
  names: Record<string, string>
  onEdit: () => void
  onDelete: () => void
}) {
  const Icon = e.recurring ? Repeat : e.employeeId ? UserRound : Receipt
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-bg/50">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          e.recurring ? 'bg-brand-primary/10 text-brand-primary' : e.employeeId ? 'bg-info-bg text-info' : 'bg-danger-bg text-danger',
        )}
      >
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 font-bold text-ink [overflow-wrap:anywhere]">{e.name}</span>
          <span className="shrink-0 font-heading font-extrabold text-danger">{formatMoney(e.amount)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {e.employeeId ? (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 font-bold text-info">
              <UserRound size={11} className="shrink-0" />
              <span className="truncate">{names[e.employeeId] ?? 'Xodim'}</span>
              <span className="font-semibold opacity-75">· {e.date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
            </span>
          ) : e.recurring ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 font-bold text-brand-primary">
              <Repeat size={10} />
              Har oy · {e.date.getDate()}-sanada
            </span>
          ) : (
            <span className="rounded-full bg-bg px-2 py-0.5 font-bold text-gray-dark">Admin</span>
          )}
          {e.fromCash && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 font-bold text-warning">
              <Banknote size={11} />
              Qo'lidagi naqddan
            </span>
          )}
          {e.note && <span className="min-w-0 text-gray-dark [overflow-wrap:anywhere]">{e.note}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <button aria-label="Tahrirlash" title="Tahrirlash" onClick={onEdit} className="rounded-lg p-2 text-gray-dark hover:bg-brand-primary/10 hover:text-brand-primary">
          <Pencil size={15} />
        </button>
        <button aria-label="O'chirish" title="O'chirish" onClick={onDelete} className="rounded-lg p-2 text-gray-dark hover:bg-danger-bg hover:text-danger">
          <Trash2 size={15} />
        </button>
      </div>
    </li>
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
  const [fromCash, setFromCash] = useState(expense?.fromCash ?? false)
  const byEmployee = !!expense?.employeeId
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), amount: Number(amount) || 0, date, recurring }
      if (editing) {
        return apiPost('/adminUpdateExpense', { ...body, expenseId: expense!.id, ...(byEmployee ? { fromCash } : {}) })
      }
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
          {byEmployee && (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3">
              <input
                type="checkbox"
                checked={fromCash}
                onChange={(e) => setFromCash(e.target.checked)}
                className="h-4 w-4 accent-brand-primary"
              />
              <div>
                <div className="text-sm font-bold text-ink">Xodim qo'lidagi naqddan</div>
                <div className="text-xs text-gray-dark">Belgilansa o'sha kuni xodim topshiradigan naqddan ayiriladi</div>
              </div>
            </label>
          )}
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

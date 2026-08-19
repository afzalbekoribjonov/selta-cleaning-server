import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Plus, CalendarRange, X, Trash2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Task } from '@/lib/tasks'
import { type Employee } from '@/lib/employees'
import { useEmployeeTasks } from '@/hooks/useEmployeeTasks'
import { formatDateTimeUz, formatDateUz, UZ_MONTHS_FULL } from '@/lib/date-utils'
import { Spinner } from '@/components/ui/Spinner'
import { useEscapeClose } from '@/hooks/useEscapeClose'

function statusInfo(task: Task): { label: string; color: string; bg: string } {
  if (task.status === 'done') return { label: 'Bajarildi', color: 'var(--color-success)', bg: 'var(--color-success-bg)' }
  if (task.status === 'delayed') return { label: 'Kechikmoqda', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' }
  const overdue = task.dueDate && task.dueDate < new Date()
  if (overdue) return { label: "Muddati o'tdi", color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' }
  return { label: 'Jarayonda', color: 'var(--color-info)', bg: 'var(--color-info-bg)' }
}

/**
 * "Boshqa" (4 ta doimiy bo'limga kirmaydigan) xodim profilida ko'rinadigan
 * topshiriqlar bo'limi — admin uchun ish maydoni (talab #5): bitta oxirgi
 * sanali vazifa yoki bir oylik kunlik topshiriqlar ro'yxati yaratish.
 */
export function TasksSection({ employee }: { employee: Employee }) {
  const { tasks, loading } = useEmployeeTasks(employee.id)
  const [singleOpen, setSingleOpen] = useState(false)
  const [monthlyOpen, setMonthlyOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)

  const singleTasks = useMemo(
    () => tasks.filter((t) => t.type === 'single').sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)),
    [tasks],
  )
  const monthlyGroups = useMemo(() => {
    const grouped: Record<string, Task[]> = {}
    for (const t of tasks.filter((t) => t.type === 'monthly')) {
      const key = t.monthKey ?? "Noma'lum"
      grouped[key] = grouped[key] ?? []
      grouped[key].push(t)
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => (a.scheduledDate?.getTime() ?? 0) - (b.scheduledDate?.getTime() ?? 0))
    }
    return grouped
  }, [tasks])

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Topshiriqlar</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSingleOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-ink hover:bg-bg"
          >
            <Plus size={14} />
            Yangi vazifa
          </button>
          <button
            onClick={() => setMonthlyOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
          >
            <CalendarRange size={14} />
            Oylik topshiriqlar
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-dark">Bu xodimga tayinlangan vazifalar va oylik topshiriqlar ro'yxati</p>

      {loading ? (
        <Spinner className="py-8" />
      ) : tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-dark">Hali topshiriq tayinlanmagan</p>
      ) : (
        <div className="space-y-6">
          {singleTasks.length > 0 && (
            <div className="space-y-2">
              {singleTasks.map((task) => {
                const info = statusInfo(task)
                return (
                  <div key={task.id} className="flex items-start justify-between gap-3 rounded-xl bg-bg p-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{task.title}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ color: info.color, backgroundColor: info.bg }}
                        >
                          {info.label}
                        </span>
                      </div>
                      {task.description && <p className="mt-1 text-xs text-gray-dark">{task.description}</p>}
                      {task.dueDate && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-dark">
                          <Clock size={11} />
                          Muddat: {formatDateTimeUz(task.dueDate)}
                        </p>
                      )}
                      {task.delayNote && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                          <AlertTriangle size={11} />
                          {task.delayNote}
                        </p>
                      )}
                    </div>
                    <button
                      title="O'chirish"
                      onClick={() => setDeleteTarget(task)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-dark hover:bg-danger-bg hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {Object.entries(monthlyGroups).map(([monthKey, items]) => (
            <div key={monthKey}>
              <div className="mb-2 text-xs font-bold text-gray-dark">{monthKey}</div>
              <div className="space-y-1.5">
                {items.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-xs font-bold text-brand-primary">
                        {task.scheduledDate?.getDate() ?? '?'}
                      </span>
                      <span className={`truncate text-sm ${task.status === 'done' ? 'text-gray-dark line-through' : 'text-ink font-medium'}`}>
                        {task.title}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {task.status === 'done' ? (
                        <CheckCircle2 size={16} className="text-success" />
                      ) : (
                        <span className="text-[10px] font-bold text-gray-dark">Kutilmoqda</span>
                      )}
                      <button
                        title="O'chirish"
                        onClick={() => setDeleteTarget(task)}
                        className="rounded-lg p-1.5 text-gray-dark hover:bg-danger-bg hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {singleOpen && <NewSingleTaskDialog employeeId={employee.id} onClose={() => setSingleOpen(false)} />}
      {monthlyOpen && <NewMonthlyTasksDialog employeeId={employee.id} onClose={() => setMonthlyOpen(false)} />}
      {deleteTarget && <DeleteTaskDialog task={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </section>
  )
}

function NewSingleTaskDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/adminCreateTask', {
        employeeId,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
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
    if (!title.trim()) {
      setError('Vazifa matnini kiriting')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">Yangi vazifa</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Vazifa matni</label>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masalan: Ombordagi hisobotni tayyorlash"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Qo'shimcha izoh (ixtiyoriy)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Oxirgi bajarilish sanasi</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
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

interface MonthlyRow {
  id: number
  day: string
  title: string
}

function NewMonthlyTasksDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const now = new Date()
  const [monthKey, setMonthKey] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [rows, setRows] = useState<MonthlyRow[]>([{ id: 1, day: '1', title: '' }])
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/adminCreateMonthlyTasks', {
        employeeId,
        monthKey,
        items: rows.map((r) => ({ day: Number(r.day), title: r.title.trim() })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  function addRow() {
    setRows((r) => [...r, { id: (r.at(-1)?.id ?? 0) + 1, day: '1', title: '' }])
  }
  function removeRow(id: number) {
    setRows((r) => r.filter((row) => row.id !== id))
  }
  function updateRow(id: number, patch: Partial<MonthlyRow>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (rows.some((r) => !r.title.trim())) {
      setError('Har bir topshiriq uchun matn kiriting')
      return
    }
    mutation.mutate()
  }

  const [year, month] = monthKey.split('-').map(Number)
  const monthLabel = `${UZ_MONTHS_FULL[month - 1]} ${year}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">Oylik topshiriqlar — {monthLabel}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Oy</label>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>

          <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={row.day}
                  onChange={(e) => updateRow(row.id, { day: e.target.value })}
                  className="w-16 shrink-0 rounded-xl border border-border bg-bg px-2 py-2.5 text-center text-sm outline-none focus:border-brand-primary"
                />
                <input
                  value={row.title}
                  onChange={(e) => updateRow(row.id, { title: e.target.value })}
                  placeholder="Shu kunga topshiriq matni"
                  className="flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="shrink-0 rounded-lg p-2 text-gray-dark hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs font-bold text-brand-primary"
          >
            <Plus size={14} />
            Yana topshiriq qo'shish
          </button>

          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {mutation.isPending ? 'Saqlanmoqda...' : `${rows.length} ta topshiriqni saqlash`}
          </button>
        </form>
      </div>
    </div>
  )
}

function DeleteTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminDeleteTask', { taskId: task.id }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-heading font-bold text-ink">Topshiriqni o'chirish</h2>
        <p className="mt-2 text-sm text-gray-dark">
          <strong className="text-ink">{task.title}</strong> o'chirilsinmi? Bu amalni ortga qaytarib bo'lmaydi.
        </p>
        {task.dueDate && <p className="mt-1 text-xs text-gray-dark">Muddat: {formatDateUz(task.dueDate)}</p>}
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

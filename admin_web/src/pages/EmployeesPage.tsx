import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, User, Phone, Wallet, KeyRound, UserX, Pencil, ChevronRight } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { type Employee, formatTenure } from '@/lib/employees'
import { useDepartmentLookup, type DepartmentInfo } from '@/hooks/useDepartmentLookup'
import { SalaryConfigDialog } from '@/components/employees/SalaryConfigDialog'
import { PinResetDialog } from '@/components/employees/PinResetDialog'
import { TerminateDialog } from '@/components/employees/TerminateDialog'
import { EditEmployeeDialog } from '@/components/employees/EditEmployeeDialog'
import { DepartmentSelectField, type DepartmentSelection } from '@/components/employees/DepartmentSelectField'
import { Spinner } from '@/components/ui/Spinner'
import { useEscapeClose } from '@/hooks/useEscapeClose'

export default function EmployeesPage() {
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [salaryTarget, setSalaryTarget] = useState<Employee | null>(null)
  const [pinTarget, setPinTarget] = useState<Employee | null>(null)
  const [terminateTarget, setTerminateTarget] = useState<Employee | null>(null)

  const query = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiPost<{ employees: Employee[] }>('/adminListEmployees'),
  })
  const { all: departments } = useDepartmentLookup()

  const byDepartment = useMemo(() => {
    const groups: Record<string, Employee[]> = {}
    for (const d of departments) groups[d.key] = []
    for (const e of query.data?.employees ?? []) {
      if (!groups[e.department]) groups[e.department] = []
      groups[e.department].push(e)
    }
    return groups
  }, [query.data, departments])

  const total = query.data?.employees.length ?? 0
  const statDepartments = departments.filter((d) => d.includeInStats)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Xodimlar</h1>
          <p className="mt-1 text-sm text-gray-dark">Bo'lim bo'yicha ajratilgan xodimlar ro'yxati</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm"
        >
          <Plus size={18} />
          Yangi xodim
        </button>
      </div>

      {query.isLoading && <Spinner className="p-8" />}
      {query.isError && (
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm font-semibold text-danger">
          {query.error instanceof ApiError ? query.error.message : 'Xatolik yuz berdi'}
        </p>
      )}

      {query.data && total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center shadow-sm">
          <User className="text-gray" size={40} />
          <p className="font-semibold text-ink">Hali xodim yo'q</p>
          <p className="text-sm text-gray-dark">"Yangi xodim" tugmasi orqali qo'shing</p>
        </div>
      )}

      {query.data && total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statDepartments.map((dept) => (
              <div key={dept.key} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <dept.icon size={20} />
                </div>
                <div>
                  <div className="font-heading text-xl font-extrabold text-ink leading-tight">{byDepartment[dept.key]?.length ?? 0}</div>
                  <div className="text-xs font-semibold text-gray-dark">{dept.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-8">
            {departments.map((dept) => {
              const employees = byDepartment[dept.key] ?? []
              if (employees.length === 0) return null
              return (
                <div key={dept.key}>
                  <div className="mb-3 flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                      <dept.icon size={17} />
                    </div>
                    <h2 className="font-heading text-lg font-bold text-ink">{dept.label}</h2>
                    <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-gray-dark">{employees.length} ta</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {employees.map((e) => (
                      <EmployeeCard
                        key={e.id}
                        employee={e}
                        dept={dept}
                        onOpen={() => navigate(`/employees/${e.id}`)}
                        onEdit={() => setEditTarget(e)}
                        onSalary={() => setSalaryTarget(e)}
                        onPin={() => setPinTarget(e)}
                        onTerminate={() => setTerminateTarget(e)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {formOpen && <NewEmployeeDialog onClose={() => setFormOpen(false)} />}
      {editTarget && <EditEmployeeDialog employee={editTarget} onClose={() => setEditTarget(null)} />}
      {salaryTarget && (
        <SalaryConfigDialog
          employeeId={salaryTarget.id}
          employeeName={salaryTarget.fullName}
          currentMethod={salaryTarget.salary?.method}
          currentParams={salaryTarget.salary?.params}
          onClose={() => setSalaryTarget(null)}
        />
      )}
      {pinTarget && <PinResetDialog employeeId={pinTarget.id} employeeName={pinTarget.fullName} onClose={() => setPinTarget(null)} />}
      {terminateTarget && <TerminateDialog employee={terminateTarget} onClose={() => setTerminateTarget(null)} />}
    </div>
  )
}

function EmployeeCard({
  employee: e,
  dept,
  onOpen,
  onEdit,
  onSalary,
  onPin,
  onTerminate,
}: {
  employee: Employee
  dept: DepartmentInfo
  onOpen: () => void
  onEdit: () => void
  onSalary: () => void
  onPin: () => void
  onTerminate: () => void
}) {
  const terminated = e.status !== 'active'
  const hiredAt = e.createdAt ? new Date(e.createdAt) : null
  const referenceEnd = e.terminatedAt ? new Date(e.terminatedAt) : new Date()

  return (
    <div
      onClick={onOpen}
      className={`group cursor-pointer rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md ${terminated ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <dept.icon size={20} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-heading font-bold text-ink">{e.fullName}</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-dark">
              <Phone size={11} />
              {e.phone}
            </div>
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-gray opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`text-xs font-bold ${terminated ? 'text-danger' : 'text-success'}`}>{terminated ? "Bo'shatilgan" : 'Faol'}</span>
        <span className="text-xs text-gray-dark">·</span>
        <span className="text-xs text-gray-dark">
          {e.salary?.method ? SALARY_METHODS[e.salary.method]?.label ?? e.salary.method : 'Maosh belgilanmagan'}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-semibold text-gray-dark">{hiredAt ? formatTenure(hiredAt, referenceEnd) : '—'}</span>
        <div className="flex gap-0.5" onClick={(ev) => ev.stopPropagation()}>
          <IconAction title="Ma'lumotlarni tahrirlash" onClick={onEdit}>
            <Pencil size={15} />
          </IconAction>
          {!terminated && (
            <>
              <IconAction title="Maosh sozlash" onClick={onSalary}>
                <Wallet size={15} />
              </IconAction>
              <IconAction title="PIN o'zgartirish" onClick={onPin}>
                <KeyRound size={15} />
              </IconAction>
              <IconAction title="Ishdan bo'shatish" danger onClick={onTerminate}>
                <UserX size={15} />
              </IconAction>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function IconAction({
  children,
  title,
  danger,
  onClick,
}: {
  children: React.ReactNode
  title: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors ${danger ? 'text-gray-dark hover:bg-danger-bg hover:text-danger' : 'text-gray-dark hover:bg-brand-primary/10 hover:text-brand-primary'}`}
    >
      {children}
    </button>
  )
}

function NewEmployeeDialog({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [selection, setSelection] = useState<DepartmentSelection>({ department: 'dispatcher' })
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminCreateEmployee', { fullName, phone, ...selection, pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const hasValidDepartment = selection.newDepartment ? !!selection.newDepartment.label.trim() : !!selection.department
    if (!hasValidDepartment) {
      setError('Xodim kasbini tanlang yoki yozing')
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN 4 ta raqamdan iborat bo‘lishi kerak')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">Yangi xodim</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Ism familiya</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Telefon raqami</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123-45-67"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <DepartmentSelectField value={selection} onChange={setSelection} mode="create" />
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">4 xonali PIN</label>
            <input
              required
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="0000"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm tracking-[0.3em] outline-none focus:border-brand-primary"
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

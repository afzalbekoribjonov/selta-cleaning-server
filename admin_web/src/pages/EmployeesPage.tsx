import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, User } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { DEPARTMENTS } from '@/lib/departments'

interface Employee {
  id: string
  fullName: string
  phone: string
  department: keyof typeof DEPARTMENTS
  status: 'active' | 'terminated'
}

export default function EmployeesPage() {
  const [formOpen, setFormOpen] = useState(false)
  const query = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiPost<{ employees: Employee[] }>('/adminListEmployees'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Xodimlar</h1>
          <p className="mt-1 text-sm text-gray-dark">Bo'lim bo'yicha xodimlar ro'yxati</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm"
        >
          <Plus size={18} />
          Yangi xodim
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        {query.isLoading && <p className="p-6 text-sm text-gray-dark">Yuklanmoqda...</p>}
        {query.isError && (
          <p className="p-6 text-sm font-semibold text-danger">
            {query.error instanceof ApiError ? query.error.message : 'Xatolik yuz berdi'}
          </p>
        )}
        {query.data && query.data.employees.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <User className="text-gray" size={40} />
            <p className="font-semibold text-ink">Hali xodim yo'q</p>
            <p className="text-sm text-gray-dark">"Yangi xodim" tugmasi orqali qo'shing</p>
          </div>
        )}
        {query.data && query.data.employees.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-gray-dark">
                  <th className="px-5 py-3 font-semibold">Ism familiya</th>
                  <th className="px-5 py-3 font-semibold">Telefon</th>
                  <th className="px-5 py-3 font-semibold">Bo'lim</th>
                  <th className="px-5 py-3 font-semibold">Holat</th>
                </tr>
              </thead>
              <tbody>
                {query.data.employees.map((e) => {
                  const dept = DEPARTMENTS[e.department]
                  return (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-semibold text-ink">{e.fullName}</td>
                      <td className="px-5 py-3 text-ink">{e.phone}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                          {dept && <dept.icon size={13} />}
                          {dept?.label ?? e.department}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            e.status === 'active'
                              ? 'text-xs font-bold text-success'
                              : 'text-xs font-bold text-danger'
                          }
                        >
                          {e.status === 'active' ? 'Faol' : "Ishdan bo'shatilgan"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && <NewEmployeeDialog onClose={() => setFormOpen(false)} />}
    </div>
  )
}

function NewEmployeeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState<keyof typeof DEPARTMENTS>('dispatcher')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminCreateEmployee', { fullName, phone, department, pin }),
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
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Xodim bo'limi</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as keyof typeof DEPARTMENTS)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            >
              {Object.entries(DEPARTMENTS).map(([key, d]) => (
                <option key={key} value={key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
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

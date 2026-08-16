import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { SALARY_METHODS } from '@/lib/salary-methods'

interface Props {
  employeeId: string
  employeeName: string
  currentMethod?: string
  currentParams?: Record<string, number>
  onClose: () => void
}

export function SalaryConfigDialog({ employeeId, employeeName, currentMethod, currentParams, onClose }: Props) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState(currentMethod ?? 'fixed')
  const [params, setParams] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (currentParams) {
      for (const [k, v] of Object.entries(currentParams)) init[k] = String(v)
    }
    return init
  })
  const [error, setError] = useState<string | null>(null)

  const methodInfo = SALARY_METHODS[method]

  const mutation = useMutation({
    mutationFn: () => {
      const numericParams: Record<string, number> = {}
      for (const field of methodInfo.fields) {
        numericParams[field.key] = Number(params[field.key]) || 0
      }
      return apiPost('/adminSetEmployeeSalary', { employeeId, method, params: numericParams })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">Maosh sozlash</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <p className="mb-5 text-sm text-gray-dark">{employeeName}</p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Hisoblash usuli</label>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value)
                setParams({})
              }}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            >
              {Object.entries(SALARY_METHODS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-dark">{methodInfo.description}</p>
          </div>

          {methodInfo.fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-sm font-semibold text-ink">{field.label}</label>
              <input
                type="number"
                value={params[field.key] ?? ''}
                onChange={(e) => setParams((p) => ({ ...p, [field.key]: e.target.value }))}
                placeholder={field.hint}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
          ))}

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

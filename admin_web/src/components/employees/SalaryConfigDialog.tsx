import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Package, X } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { SALARY_METHODS, recommendedSalaryMethods } from '@/lib/salary-methods'
import { useEscapeClose } from '@/hooks/useEscapeClose'

interface Props {
  employeeId: string
  employeeName: string
  department: string
  currentMethod?: string
  currentParams?: Record<string, number>
  onClose: () => void
}

export function SalaryConfigDialog({ employeeId, employeeName, department, currentMethod, currentParams, onClose }: Props) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const recommended = recommendedSalaryMethods(department)
  // Noma'lum (eski) usul bo'lsa — kasbiga mos birinchi usul taklif qilinadi.
  const [method, setMethod] = useState(currentMethod && SALARY_METHODS[currentMethod] ? currentMethod : recommended[0])
  const [params, setParams] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (currentParams) {
      for (const [k, v] of Object.entries(currentParams)) init[k] = String(v)
    }
    return init
  })
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(recommended.length === Object.keys(SALARY_METHODS).length || !recommended.includes(method))

  const methodInfo = SALARY_METHODS[method]
  const methodOptions = showAll ? Object.keys(SALARY_METHODS) : recommended

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
      queryClient.invalidateQueries({ queryKey: ['workPeriod'] })
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
              {methodOptions.map((key) => (
                <option key={key} value={key}>
                  {SALARY_METHODS[key].label}
                </option>
              ))}
            </select>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-dark">{methodInfo.description}</p>
              {!showAll && (
                <button type="button" onClick={() => setShowAll(true)} className="shrink-0 text-xs font-bold text-brand-primary hover:underline">
                  Barcha usullar
                </button>
              )}
            </div>
          </div>

          {methodInfo.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-semibold text-ink">{field.label}</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={params[field.key] ?? ''}
                  onChange={(e) => setParams((p) => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.hint}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </div>
            ))}

          {methodInfo.piecework && (
            <div className="flex items-start gap-3 rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                <Package size={17} />
              </div>
              <div className="min-w-0 text-xs leading-relaxed text-gray-dark">
                <p className="font-bold text-ink">Ishbay narxlari mahsulotlar bo'yicha</p>
                <p>
                  Har bir mahsulotning 1 m², metr, kg yoki donasi uchun yuvish va qadoqlash narxi bir marta kiritiladi — hamma xodimga
                  bir xil qo'llanadi. Qayta yuvish uchun haq to'lanmaydi.
                </p>
                <Link
                  to="/products#ishbay"
                  onClick={onClose}
                  className="mt-1 inline-flex items-center gap-1 font-bold text-brand-primary hover:underline"
                >
                  Narxlarni ko'rish <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}

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

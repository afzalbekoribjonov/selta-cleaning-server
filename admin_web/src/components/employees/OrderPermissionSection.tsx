import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusCircle } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Employee } from '@/lib/employees'

/**
 * "Buyurtma yaratish huquqi" — talab: sotuv menejeri bo'lmagan xodimga
 * ham (masalan mijoz do'konga o'zi kelganda, "O'zi keldi" bilan)
 * buyurtma ochish imkoniyatini berish. Sotuv menejerida bu huquq
 * bo'limining o'zidan kelib chiqadi, shuning uchun ular uchun
 * ko'rsatilmaydi (EmployeeDetailPage shu shartda chaqiradi).
 *
 * Tugma bosilganda darrov (optimistik) almashadi — `employee` prop
 * `['employees']` so'rovi qayta yuklangunga qadar hali eski qiymatni
 * ko'rsatib turadi, shuning uchun mahalliy holat kerak. Refetch tugagach
 * (invalidateQueries'ning o'zi shu va'dani beradi) mahalliy holat
 * tozalanadi — bu orada "eski qiymatga bir lahzaga qaytib, keyin
 * qaytadan yangilanish" (miltillash) yuz bermasligi uchun tozalash
 * refetch tugashini kutadi, natijada darrov emas.
 */
export function OrderPermissionSection({ employee }: { employee: Employee }) {
  const queryClient = useQueryClient()
  const terminated = employee.status !== 'active'
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (value: boolean) => apiPost('/adminSetEmployeeOrderPermission', { employeeId: employee.id, canCreateOrders: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      setOptimistic(null)
    },
    onError: (err) => {
      setOptimistic(null)
      setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi')
    },
  })

  const enabled = optimistic ?? employee.canCreateOrders

  function handleToggle() {
    setError(null)
    const next = !enabled
    setOptimistic(next)
    mutation.mutate(next)
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PlusCircle size={18} className="text-brand-primary" />
          <div>
            <h2 className="font-heading font-bold text-ink">Buyurtma yaratish huquqi</h2>
            <p className="mt-0.5 text-xs text-gray-dark">
              Mijoz do'konga o'zi kelganda ("O'zi keldi") shu xodim buyurtma ochishi mumkin bo'ladi — ilovada ismi yonida "+" tugmasi paydo bo'ladi
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={terminated || mutation.isPending}
          onClick={handleToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-brand-primary' : 'bg-border'
          }`}
          aria-pressed={enabled}
          aria-label="Buyurtma yaratish huquqini almashtirish"
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
      {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}
    </section>
  )
}

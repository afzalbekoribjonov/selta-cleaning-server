import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusCircle, ShieldCheck, ShieldOff } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { type Employee } from '@/lib/employees'

/**
 * "Buyurtma yaratish huquqi" — talab: sotuv menejeri bo'lmagan xodimga
 * ham (masalan mijoz do'konga o'zi kelganda, "O'zi keldi" bilan)
 * buyurtma ochish imkoniyatini berish. Sotuv menejerida bu huquq
 * bo'limining o'zidan kelib chiqadi, shuning uchun ular uchun
 * ko'rsatilmaydi (EmployeeDetailPage shu shartda chaqiradi).
 *
 * Oddiy almashtiruvchi (toggle) o'rniga tugma + tasdiqlash oynasi —
 * talab: har bir o'zgarish ongli ravishda tasdiqlansin (masalan tasodifan
 * bosib yuborish bilan huquq berib/olib qo'yilmasin).
 */
export function OrderPermissionSection({ employee }: { employee: Employee }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const terminated = employee.status !== 'active'
  const enabled = employee.canCreateOrders

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PlusCircle size={18} className="text-brand-primary" />
          <div>
            <h2 className="font-heading font-bold text-ink">Buyurtma yaratish huquqi</h2>
            <p className="mt-0.5 text-xs text-gray-dark">
              Mijoz do'konga o'zi kelganda ("O'zi keldi") shu xodim buyurtma ochishi mumkin bo'ladi — ilovada ismi yonida "+" tugmasi paydo bo'ladi
            </p>
          </div>
        </div>
        {!terminated &&
          (enabled ? (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-danger px-3 py-2 text-xs font-bold text-danger hover:bg-danger-bg"
            >
              <ShieldOff size={14} />
              Vakolatni olish
            </button>
          ) : (
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
            >
              <ShieldCheck size={14} />
              Vakolat berish
            </button>
          ))}
      </div>

      {confirmOpen && (
        <ConfirmOrderPermissionDialog employee={employee} grant={!enabled} onClose={() => setConfirmOpen(false)} />
      )}
    </section>
  )
}

function ConfirmOrderPermissionDialog({
  employee,
  grant,
  onClose,
}: {
  employee: Employee
  /** true — huquq berilmoqda, false — olib qo'yilmoqda. */
  grant: boolean
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetEmployeeOrderPermission', { employeeId: employee.id, canCreateOrders: grant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="flex items-center gap-2 text-lg font-heading font-bold text-ink">
          {grant ? <ShieldCheck size={18} className="text-brand-primary" /> : <ShieldOff size={18} className="text-danger" />}
          {grant ? 'Vakolat berish' : 'Vakolatni olish'}
        </h2>
        <p className="mt-2 text-sm text-gray-dark">
          {grant ? (
            <>
              <strong className="text-ink">{employee.fullName}</strong>ga buyurtma yaratish huquqi berilsinmi? Mijoz do'konga o'zi
              kelganda ("O'zi keldi") shu xodim buyurtma ocha oladigan bo'ladi.
            </>
          ) : (
            <>
              <strong className="text-ink">{employee.fullName}</strong>dan buyurtma yaratish huquqi olib qo'yilsinmi? Ilovadagi "+"
              tugmasi endi ko'rinmaydi.
            </>
          )}
        </p>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
            Bekor qilish
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60 ${grant ? 'bg-brand-primary' : 'bg-danger'}`}
          >
            {mutation.isPending ? '...' : 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, Pencil, X, PackageCheck } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Employee } from '@/lib/employees'
import { PRODUCT_CATEGORY_CONFIG, type ProductCategory } from '@/lib/products'
import { useEscapeClose } from '@/hooks/useEscapeClose'

const CATEGORY_KEYS = Object.keys(PRODUCT_CATEGORY_CONFIG) as ProductCategory[]

/**
 * Ishchining qaysi mahsulot toifalarini (gilam/parda/boshqa) ishlashi
 * mumkinligi va "upakovkachi" huquqi — faqat "worker" bo'limi uchun
 * ma'noli (EmployeeDetailPage shu shartda ko'rsatadi). Talab: "lavozimlar".
 */
export function SpecializationsSection({ employee }: { employee: Employee }) {
  const [editOpen, setEditOpen] = useState(false)
  const terminated = employee.status !== 'active'

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Lavozimlar</h2>
        </div>
        {!terminated && (
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
          >
            <Pencil size={14} />
            Tahrirlash
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-dark">Qaysi mahsulot toifalarini ishlashi mumkinligi — buyurtma yaratishda salary usuli tavsiyasiga ham ta'sir qiladi</p>

      {employee.specializations.length === 0 && !employee.canPack ? (
        <div className="rounded-xl bg-warning-bg py-4 text-center text-sm">
          <p className="font-semibold text-ink">Hali lavozim belgilanmagan</p>
          <p className="mt-1 text-xs text-gray-dark">Lavozimsiz xodim buyurtma holatini o'zgartira olmaydi — mobil ilovada barcha amallar bloklangan bo'ladi</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {employee.specializations.map((s) => (
            <span key={s} className="inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1.5 text-xs font-bold text-brand-primary">
              {PRODUCT_CATEGORY_CONFIG[s as ProductCategory]?.label ?? s}
            </span>
          ))}
          {employee.canPack && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent/15 px-3 py-1.5 text-xs font-bold text-ink">
              <PackageCheck size={13} />
              Upakovkachi
            </span>
          )}
        </div>
      )}

      {editOpen && <EditSpecializationsDialog employee={employee} onClose={() => setEditOpen(false)} />}
    </section>
  )
}

function EditSpecializationsDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [specializations, setSpecializations] = useState<string[]>(employee.specializations)
  const [canPack, setCanPack] = useState(employee.canPack)
  const [error, setError] = useState<string | null>(null)

  function toggle(key: ProductCategory) {
    setSpecializations((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))
  }

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetEmployeeSpecializations', { employeeId: employee.id, specializations, canPack }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">Lavozimlarni tahrirlash</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Ishlashi mumkin bo'lgan mahsulot toifalari</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_KEYS.map((key) => {
                const selected = specializations.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-bold transition-colors ${
                      selected ? 'border-brand-primary bg-brand-primary text-white' : 'border-border bg-bg text-ink'
                    }`}
                  >
                    {PRODUCT_CATEGORY_CONFIG[key].label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
            <input type="checkbox" checked={canPack} onChange={(e) => setCanPack(e.target.checked)} className="h-4 w-4" />
            <div>
              <div className="text-sm font-bold text-ink">Upakovkachi</div>
              <div className="text-xs text-gray-dark">Buyurtmalarni upakovka qilish huquqi</div>
            </div>
          </label>

          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

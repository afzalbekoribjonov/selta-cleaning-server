import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Pencil, Trash2, Package, Percent } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useProducts, useConditionSurcharges } from '@/hooks/useProducts'
import { CALC_TYPE_CONFIG, type Product, type CalcType } from '@/lib/products'
import { Spinner } from '@/components/ui/Spinner'
import { useEscapeClose } from '@/hooks/useEscapeClose'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function priceLabel(p: Product): string {
  if (p.calcType === 'size') return `Kichik: ${formatMoney(p.smallPrice ?? 0)} / Katta: ${formatMoney(p.largePrice ?? 0)}`
  return `${formatMoney(p.unitPrice ?? 0)} ${CALC_TYPE_CONFIG[p.calcType].unitLabel.replace(/^so'm\s*\/\s*/, '/ ')}`
}

export default function ProductsPage() {
  const { products, loading } = useProducts()
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Mahsulotlar</h1>
          <p className="mt-1 text-sm text-gray-dark">Narx katalogi — hisoblash turi va narxlarni oldindan belgilang</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm"
        >
          <Plus size={18} />
          Yangi mahsulot
        </button>
      </div>

      <ConditionSurchargesCard />

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        {loading && <Spinner className="p-8" />}
        {!loading && products && products.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Package className="text-gray" size={40} />
            <p className="font-semibold text-ink">Hali mahsulot yo'q</p>
            <p className="text-sm text-gray-dark">"Yangi mahsulot" tugmasi orqali qo'shing</p>
          </div>
        )}
        {!loading && products && products.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-gray-dark">
                  <th className="px-5 py-3 font-semibold">Nomi</th>
                  <th className="px-5 py-3 font-semibold">Hisoblash turi</th>
                  <th className="px-5 py-3 font-semibold">Narx</th>
                  <th className="px-5 py-3 font-semibold text-right">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-semibold text-ink">{p.name}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                        {CALC_TYPE_CONFIG[p.calcType].label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink">{priceLabel(p)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          title="Tahrirlash"
                          onClick={() => setEditTarget(p)}
                          className="rounded-lg p-2 text-gray-dark transition-colors hover:bg-brand-primary/10 hover:text-brand-primary"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          title="O'chirish"
                          onClick={() => setDeleteTarget(p)}
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

      {formOpen && <ProductFormDialog onClose={() => setFormOpen(false)} />}
      {editTarget && <ProductFormDialog product={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteProductDialog product={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}

function ConditionSurchargesCard() {
  const { surcharges, loading } = useConditionSurcharges()
  const queryClient = useQueryClient()
  const [average, setAverage] = useState('')
  const [bad, setBad] = useState('')
  const [veryBad, setVeryBad] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!initialized && surcharges) {
    setAverage(String(surcharges.average))
    setBad(String(surcharges.bad))
    setVeryBad(String(surcharges.veryBad))
    setInitialized(true)
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/adminSetConditionSurcharges', {
        average: Number(average) || 0,
        bad: Number(bad) || 0,
        veryBad: Number(veryBad) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Percent size={18} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Mahsulot holati — narx ustamasi</h2>
      </div>
      <p className="mb-4 text-xs text-gray-dark">
        Xodim mahsulot qo'shganda "Holati"ni tanlasa, shu foiz narxga qo'shiladi (masalan "Juda yomon" +50%).
      </p>
      {loading ? (
        <Spinner className="py-4" />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <SurchargeField label="O'rtacha (%)" value={average} onChange={setAverage} />
          <SurchargeField label="Yomon (%)" value={bad} onChange={setBad} />
          <SurchargeField label="Juda yomon (%)" value={veryBad} onChange={setVeryBad} />
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
          {saved && <span className="text-sm font-semibold text-success">Saqlandi</span>}
          {mutation.isError && (
            <span className="text-sm font-semibold text-danger">
              {mutation.error instanceof ApiError ? mutation.error.message : 'Xatolik yuz berdi'}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function SurchargeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      <input
        type="number"
        min={0}
        max={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
      />
    </div>
  )
}

function ProductFormDialog({ product, onClose }: { product?: Product; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const editing = !!product
  const [name, setName] = useState(product?.name ?? '')
  const [calcType, setCalcType] = useState<CalcType>(product?.calcType ?? 'sqm')
  const [unitPrice, setUnitPrice] = useState(product?.unitPrice != null ? String(product.unitPrice) : '')
  const [smallPrice, setSmallPrice] = useState(product?.smallPrice != null ? String(product.smallPrice) : '')
  const [largePrice, setLargePrice] = useState(product?.largePrice != null ? String(product.largePrice) : '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: name.trim(), calcType }
      if (calcType === 'size') {
        body.smallPrice = Number(smallPrice) || 0
        body.largePrice = Number(largePrice) || 0
      } else {
        body.unitPrice = Number(unitPrice) || 0
      }
      if (editing) {
        return apiPost('/adminUpdateProduct', { ...body, productId: product!.id })
      }
      return apiPost('/adminCreateProduct', body)
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
      setError('Mahsulot nomini kiriting')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-ink">{editing ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Mahsulot nomi</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Hisoblash turi</label>
            <select
              value={calcType}
              onChange={(e) => setCalcType(e.target.value as CalcType)}
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
            >
              {Object.entries(CALC_TYPE_CONFIG).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          {calcType === 'size' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Kichik narx (so'm)</label>
                <input
                  type="number"
                  min={0}
                  value={smallPrice}
                  onChange={(e) => setSmallPrice(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Katta narx (so'm)</label>
                <input
                  type="number"
                  min={0}
                  value={largePrice}
                  onChange={(e) => setLargePrice(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Narx ({CALC_TYPE_CONFIG[calcType].unitLabel})</label>
              <input
                type="number"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
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

function DeleteProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminDeleteProduct', { productId: product.id }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-heading font-bold text-ink">Mahsulotni o'chirish</h2>
        <p className="mt-2 text-sm text-gray-dark">
          <strong className="text-ink">{product.name}</strong> katalogdan o'chirilsinmi? Bu mahsulot ishlatilgan eski buyurtmalarga ta'sir qilmaydi.
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

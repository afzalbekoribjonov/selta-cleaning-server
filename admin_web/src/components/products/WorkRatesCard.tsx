import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Coins, Info, RotateCcw, Save, Search } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { PRODUCT_CATEGORY_CONFIG, WORK_UNIT_LABEL, type Product } from '@/lib/products'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'

type Draft = { wash: string; pack: string }

const toText = (v: number | null) => (v && v > 0 ? String(v) : '')
const groupDigits = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const parse = (s: string): number | null | 'bad' => {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? (n === 0 ? null : n) : 'bad'
}

/**
 * Ishbay narxlari — har bir mahsulotning 1 birligi (m², metr, kg yoki
 * dona) uchun xodimga to'lanadigan yuvish va qadoqlash narxi. Bir marta
 * kiritiladi va ishbay usulidagi HAMMA xodimga bir xil qo'llanadi (avval
 * har bir xodimga alohida, faqat m² uchun kiritilardi).
 */
export function WorkRatesCard({ products }: { products: Product[] }) {
  const queryClient = useQueryClient()
  const sectionRef = useRef<HTMLElement>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Maosh oynasidagi "Narxlarni ko'rish" havolasi (#ishbay) shu yerga olib keladi.
  useEffect(() => {
    if (window.location.hash === '#ishbay') sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const valueOf = (p: Product, key: keyof Draft) => drafts[p.id]?.[key] ?? toText(p.workRates[key])

  const changes = useMemo(() => {
    const out: Record<string, { wash: number | null; pack: number | null }> = {}
    let invalid = false
    for (const p of products) {
      const d = drafts[p.id]
      if (!d) continue
      const wash = parse(d.wash)
      const pack = parse(d.pack)
      if (wash === 'bad' || pack === 'bad') {
        invalid = true
        continue
      }
      if (wash !== p.workRates.wash || pack !== p.workRates.pack) out[p.id] = { wash, pack }
    }
    return { rates: out, count: Object.keys(out).length, invalid }
  }, [drafts, products])

  const missing = products.filter((p) => !p.workRates.wash || !p.workRates.pack).length

  const visible = products.filter((p) => {
    if (onlyMissing && p.workRates.wash && p.workRates.pack) return false
    return !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  })

  const mutation = useMutation({
    mutationFn: () => apiPost('/adminSetProductWorkRates', { rates: changes.rates }),
    onSuccess: () => {
      setDrafts({})
      setError(null)
      setSavedAt(Date.now())
      // Maosh va statistika sahifasi yangi narx bilan qayta hisoblansin.
      queryClient.invalidateQueries({ queryKey: ['workPeriod'] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Saqlab bo\'lmadi'),
  })

  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 2500)
    return () => clearTimeout(t)
  }, [savedAt])

  const setValue = (p: Product, key: keyof Draft, value: string) =>
    setDrafts((d) => {
      const base: Draft = d[p.id] ?? { wash: toText(p.workRates.wash), pack: toText(p.workRates.pack) }
      return { ...d, [p.id]: { ...base, [key]: value } }
    })

  return (
    <section id="ishbay" ref={sectionRef} className="scroll-mt-20 rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Coins size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-extrabold leading-tight text-ink sm:text-lg">Ishbay narxlari</h2>
            <p className="mt-0.5 text-xs leading-snug text-gray-dark sm:text-[13px]">
              Xodimga 1 birlik uchun to'lanadi — yuvgani va qadoqlagani uchun alohida. Ishbay usulidagi hamma xodimga bir xil.
            </p>
          </div>
        </div>
        {products.length > 0 &&
          (missing > 0 ? (
            <button
              onClick={() => setOnlyMissing((v) => !v)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                onlyMissing ? 'bg-warning text-white' : 'bg-warning-bg text-warning hover:bg-warning/20',
              )}
            >
              <AlertTriangle size={13} />
              {missing} ta mahsulotda narx to'liq emas
            </button>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-bg px-3 py-1.5 text-xs font-bold text-success">
              <CheckCircle2 size={13} />
              Hammasi to'ldirilgan
            </span>
          ))}
      </header>

      <div className="space-y-3 p-4 sm:p-5">
        {products.length > 6 && (
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-dark" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mahsulotni qidirish"
              className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
            />
          </label>
        )}

        {visible.length === 0 ? (
          <p className="rounded-xl bg-bg py-8 text-center text-sm text-gray-dark">
            {products.length === 0 ? "Avval mahsulot qo'shing" : 'Mos mahsulot topilmadi'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] gap-3 bg-bg px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-dark md:grid">
              <span>Mahsulot</span>
              <span>Yuvish</span>
              <span>Qadoqlash</span>
              <span className="text-right">Namuna (10 birlik)</span>
            </div>
            <ul className="divide-y divide-border">
              {visible.map((p) => {
                const unit = WORK_UNIT_LABEL[p.calcType]
                const wash = parse(valueOf(p, 'wash'))
                const pack = parse(valueOf(p, 'pack'))
                const dirty = !!changes.rates[p.id]
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'grid gap-x-3 gap-y-2 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center',
                      dirty && 'bg-brand-primary/[0.04]',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-primary" title="O'zgartirildi" />}
                      <div className="min-w-0">
                        <div className="font-bold text-ink [overflow-wrap:anywhere]">{p.name}</div>
                        <div className="text-[11px] font-semibold text-gray-dark">
                          {PRODUCT_CATEGORY_CONFIG[p.category]?.label ?? p.category} · 1 {unit} uchun
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <RateInput label="Yuvish" unit={unit} value={valueOf(p, 'wash')} invalid={wash === 'bad'} onChange={(v) => setValue(p, 'wash', v)} />
                      <RateInput label="Qadoqlash" unit={unit} value={valueOf(p, 'pack')} invalid={pack === 'bad'} onChange={(v) => setValue(p, 'pack', v)} />
                    </div>
                    <div className="text-xs text-gray-dark md:text-right">
                      {typeof wash === 'number' || typeof pack === 'number' ? (
                        <>
                          <span className="whitespace-nowrap">
                            10 {unit}: <b className="text-ink">{formatMoney(10 * ((typeof wash === 'number' ? wash : 0) + (typeof pack === 'number' ? pack : 0)))}</b>
                          </span>
                          <span className="block text-[11px]">
                            <span className="whitespace-nowrap">yuvish {typeof wash === 'number' ? groupDigits(10 * wash) : '—'}</span>
                            {' · '}
                            <span className={cn('whitespace-nowrap', typeof pack !== 'number' && 'font-semibold text-warning')}>
                              qadoqlash {typeof pack === 'number' ? groupDigits(10 * pack) : "yo'q"}
                            </span>
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-warning">Narx kiritilmagan — ishbay hisoblanmaydi</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-gray-dark">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Qayta yuvish uchun haq to'lanmaydi va u "Yuvildi" jamiga qo'shilmaydi. Narx o'zgartirilsa, "Maosh va statistika"da tanlangan
            davr yangi narx bilan hisoblanadi.
          </span>
        </p>

        {(changes.count > 0 || changes.invalid || error || savedAt) && (
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
            <div className="min-w-0 flex-1 text-sm">
              {error ? (
                <span className="font-bold text-danger">{error}</span>
              ) : changes.invalid ? (
                <span className="font-bold text-danger">Narx 0 dan 10 000 000 gacha son bo'lishi kerak</span>
              ) : savedAt && changes.count === 0 ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-success">
                  <CheckCircle2 size={16} /> Saqlandi
                </span>
              ) : (
                <span className="font-bold text-ink">{changes.count} ta mahsulot narxi o'zgardi</span>
              )}
            </div>
            {(changes.count > 0 || changes.invalid) && (
              <>
                <button
                  onClick={() => {
                    setDrafts({})
                    setError(null)
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-gray-dark hover:bg-bg"
                >
                  <RotateCcw size={15} />
                  Bekor qilish
                </button>
                <button
                  disabled={changes.count === 0 || changes.invalid || mutation.isPending}
                  onClick={() => mutation.mutate()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-primary-dark disabled:opacity-50"
                >
                  <Save size={15} />
                  {mutation.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function RateInput({
  label,
  unit,
  value,
  invalid,
  onChange,
}: {
  label: string
  unit: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold text-gray-dark md:hidden">{label}</span>
      <span
        className={cn(
          'flex h-10 min-w-0 items-center rounded-xl border bg-bg transition-colors focus-within:border-brand-primary focus-within:bg-surface',
          invalid ? 'border-danger' : 'border-border',
        )}
      >
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          aria-label={`${label} narxi, so'm / ${unit}`}
          className="w-full min-w-0 bg-transparent px-3 text-sm font-bold text-ink outline-none placeholder:font-medium placeholder:text-gray"
        />
        <span className="shrink-0 whitespace-nowrap pr-3 text-[11px] font-semibold text-gray-dark">so'm/{unit}</span>
      </span>
    </label>
  )
}

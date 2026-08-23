import { useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { TARIFF_CONFIG } from '@/lib/status-config'
import { useProducts, useConditionSurcharges } from '@/hooks/useProducts'
import { priceFor, appliesToTariff, percentFor, CALC_TYPE_LABELS, type Product } from '@/lib/products'
import type { CatalogItemDraft } from '@/lib/order-items'

const CONDITIONS: { key: string | null; label: string }[] = [
  { key: null, label: 'Yaxshi' },
  { key: 'average', label: "O'rtacha" },
  { key: 'bad', label: 'Yomon' },
  { key: 'veryBad', label: 'Juda yomon' },
]

interface Props {
  serviceType: 'pickup' | 'onsite'
  onClose: () => void
  onLocalAdd: (draft: CatalogItemDraft) => void
}

/**
 * Sotuv menejeri faqat "Yangi buyurtma" yaratayotganda, buyurtma hali
 * mavjud bo'lmagan holda mahalliy (draft) ro'yxatga mahsulot qo'shadi —
 * mobile/lib/features/dispatcher/new_order_tab.dart:openDraftItemSheet
 * bilan bir xil. Mavjud buyurtmaga mahsulot qo'shish/tahrirlash faqat
 * ishchi/dastavchik vazifasi (mobile: catalog_item_sheet.dart openCatalogItemSheet),
 * bu saytda kerak emas.
 */
export function CatalogItemModal({ serviceType, onClose, onLocalAdd }: Props) {
  const { products } = useProducts()
  const surcharges = useConditionSurcharges()

  const [product, setProduct] = useState<Product | null>(null)
  const [customMode, setCustomMode] = useState(false)
  const [name, setName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [directArea, setDirectArea] = useState('')
  const [sqmDirectMode, setSqmDirectMode] = useState(false)
  const [qty, setQty] = useState(1)
  const [sizeVariant, setSizeVariant] = useState<'small' | 'large'>('small')
  const [condition, setCondition] = useState<string | null>(null)
  const [tariff, setTariff] = useState('standart')

  const showTariffPicker = serviceType === 'pickup'

  const measuredQty = (): number => {
    if (product?.calcType === 'sqm') {
      if (sqmDirectMode) return parseFloat(directArea.replace(',', '.')) || 0
      const w = parseFloat(width.replace(',', '.')) || 0
      const h = parseFloat(height.replace(',', '.')) || 0
      return Math.round(w * h * 100) / 100
    }
    return qty
  }

  const estimatedPrice = (): number => {
    if (customMode || !product) {
      return parseFloat(customPrice.replace(',', '.')) || 0
    }
    const tp = priceFor(product, tariff)
    let base: number
    if (product.calcType === 'size') {
      base = (sizeVariant === 'large' ? tp.largePrice : tp.smallPrice) ?? 0
    } else {
      base = (tp.unitPrice ?? 0) * measuredQty()
    }
    const percent = percentFor(surcharges, condition)
    return Math.round(base * (1 + percent / 100))
  }

  function buildDraft(): CatalogItemDraft {
    const finalName = name.trim() || product?.name || 'Mahsulot'
    if (customMode || !product) {
      return { name: finalName, calcType: 'fixed', tariff, price: parseFloat(customPrice.replace(',', '.')) || 0 }
    }
    return {
      name: finalName,
      productId: product.id,
      calcType: product.calcType,
      tariff,
      width: product.calcType === 'sqm' && !sqmDirectMode ? parseFloat(width.replace(',', '.')) || undefined : undefined,
      height: product.calcType === 'sqm' && !sqmDirectMode ? parseFloat(height.replace(',', '.')) || undefined : undefined,
      qty: product.calcType === 'size' ? undefined : measuredQty(),
      sizeVariant: product.calcType === 'size' ? sizeVariant : undefined,
      condition: condition ?? undefined,
    }
  }

  function handleSave() {
    onLocalAdd(buildDraft())
    onClose()
  }

  const filteredProducts = products.filter((p) => appliesToTariff(p, tariff))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-lg font-extrabold text-ink">Mahsulot qo'shish</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-dark hover:bg-bg">
            <X size={18} />
          </button>
        </div>

        {showTariffPicker && (
          <div className="mb-5">
            <p className="mb-1 text-sm font-extrabold text-ink">Tarif</p>
            <p className="mb-2 text-xs text-gray-dark">Har bir mahsulot o'z tarifiga ega bo'ladi</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TARIFF_CONFIG).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => {
                    setTariff(key)
                    setProduct(null)
                  }}
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
                  style={
                    tariff === key
                      ? { background: info.color, color: 'white' }
                      : { background: 'var(--color-surface)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                  }
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!customMode ? (
          <div className="mb-4">
            <p className="mb-2 text-sm font-extrabold text-ink">Katalogdan tanlang</p>
            {filteredProducts.length === 0 ? (
              <p className="text-xs text-gray-dark">
                {products.length === 0 ? "Katalogda hali mahsulot yo'q" : `Bu tarif uchun mahsulot yo'q`}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProduct(p)
                      setName(p.name)
                      setCondition(null)
                      setQty(1)
                    }}
                    className="rounded-xl px-3 py-2 text-xs font-bold transition-colors"
                    style={
                      product?.id === p.id
                        ? { background: '#5A148C', color: 'white' }
                        : { background: 'var(--color-bg)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                    }
                  >
                    {p.name} <span className="opacity-70">({CALC_TYPE_LABELS[p.calcType]})</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setCustomMode(true)
                setProduct(null)
              }}
              className="mt-2 text-xs font-bold text-brand-primary hover:underline"
            >
              Katalogda yo'q — qo'lda kiritish
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCustomMode(false)}
            className="mb-4 text-xs font-bold text-brand-primary hover:underline"
          >
            ← Katalogdan tanlash
          </button>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-bold text-ink">Nomi</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>

        {customMode ? (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-bold text-ink">Narx (so'm)</label>
            <input
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
        ) : product ? (
          <>
            <CalcInputs
              product={product}
              tariff={tariff}
              width={width}
              setWidth={setWidth}
              height={height}
              setHeight={setHeight}
              directArea={directArea}
              setDirectArea={setDirectArea}
              sqmDirectMode={sqmDirectMode}
              setSqmDirectMode={setSqmDirectMode}
              qty={qty}
              setQty={setQty}
              sizeVariant={sizeVariant}
              setSizeVariant={setSizeVariant}
              measuredQty={measuredQty()}
            />
            <div className="mb-4">
              <p className="mb-1 text-sm font-extrabold text-ink">Holati</p>
              <p className="mb-2 text-xs text-gray-dark">Mahsulotning ifloslanish darajasi — narxga ustama qo'shadi</p>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => {
                  const percent = percentFor(surcharges, c.key)
                  const selected = condition === c.key
                  return (
                    <button
                      key={c.key ?? 'good'}
                      onClick={() => setCondition(c.key)}
                      className="rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
                      style={
                        selected
                          ? { background: percent > 0 ? '#DC2626' : '#7A7482', color: 'white' }
                          : { background: 'var(--color-surface)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }
                      }
                    >
                      {percent > 0 ? `${c.label} (+${percent}%)` : c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        ) : null}

        <div className="mb-4 flex items-center justify-between rounded-2xl border border-brand-primary/20 bg-brand-primary/[0.06] px-4 py-3.5">
          <span className="text-sm font-bold text-ink">Taxminiy narx</span>
          <span className="text-base font-extrabold text-brand-primary">{estimatedPrice().toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm</span>
        </div>

        <button
          onClick={handleSave}
          className="w-full rounded-xl bg-brand-primary py-3 text-sm font-extrabold text-white shadow-sm"
        >
          QO'SHISH
        </button>
      </div>
    </div>
  )
}

function CalcInputs(props: {
  product: Product
  tariff: string
  width: string
  setWidth: (v: string) => void
  height: string
  setHeight: (v: string) => void
  directArea: string
  setDirectArea: (v: string) => void
  sqmDirectMode: boolean
  setSqmDirectMode: (v: boolean) => void
  qty: number
  setQty: (v: number) => void
  sizeVariant: 'small' | 'large'
  setSizeVariant: (v: 'small' | 'large') => void
  measuredQty: number
}) {
  const { product, tariff } = props
  const tp = priceFor(product, tariff)

  if (product.calcType === 'sqm') {
    return (
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-extrabold text-ink">O'lcham</p>
          <button
            onClick={() => props.setSqmDirectMode(!props.sqmDirectMode)}
            className="text-xs font-bold text-brand-primary hover:underline"
          >
            {props.sqmDirectMode ? "Eni x Bo'yi kiritish" : "To'g'ridan m² kiritish"}
          </button>
        </div>
        {props.sqmDirectMode ? (
          <input
            value={props.directArea}
            onChange={(e) => props.setDirectArea(e.target.value)}
            inputMode="decimal"
            placeholder="m²"
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        ) : (
          <div className="flex gap-2">
            <input
              value={props.width}
              onChange={(e) => props.setWidth(e.target.value)}
              inputMode="decimal"
              placeholder="Eni (m)"
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
            <input
              value={props.height}
              onChange={(e) => props.setHeight(e.target.value)}
              inputMode="decimal"
              placeholder="Bo'yi (m)"
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
        )}
        <p className="mt-1.5 text-xs text-gray-dark">
          Jami: {props.measuredQty.toFixed(2)} m² × {(tp.unitPrice ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm
        </p>
      </div>
    )
  }

  if (product.calcType === 'size') {
    return (
      <div className="mb-4">
        <p className="mb-2 text-sm font-extrabold text-ink">Hajmi</p>
        <div className="flex gap-2">
          {(['small', 'large'] as const).map((v) => (
            <button
              key={v}
              onClick={() => props.setSizeVariant(v)}
              className="flex-1 rounded-xl border py-3 text-center transition-colors"
              style={
                props.sizeVariant === v
                  ? { borderColor: '#5A148C', background: 'rgba(90,20,140,0.08)' }
                  : { borderColor: 'var(--color-border)' }
              }
            >
              <p className="text-sm font-extrabold text-ink">{v === 'small' ? 'Kichik' : 'Katta'}</p>
              <p className="text-xs text-gray-dark">
                {((v === 'small' ? tp.smallPrice : tp.largePrice) ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm
              </p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const label = product.calcType === 'meter' ? 'Metr' : product.calcType === 'kg' ? 'Kilogram' : 'Soni'
  const step = product.calcType === 'count' ? 1 : 0.5

  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-extrabold text-ink">{label}</p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => props.setQty(Math.max(0, props.qty - step))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20"
        >
          <Minus size={16} />
        </button>
        <input
          value={props.qty.toString()}
          onChange={(e) => props.setQty(parseFloat(e.target.value.replace(',', '.')) || 0)}
          inputMode="decimal"
          className="w-16 rounded-xl border border-border bg-bg px-2 py-2 text-center text-sm outline-none focus:border-brand-primary"
        />
        <button
          onClick={() => props.setQty(props.qty + step)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20"
        >
          <Plus size={16} />
        </button>
        <span className="text-xs text-gray-dark">× {(tp.unitPrice ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm</span>
      </div>
    </div>
  )
}

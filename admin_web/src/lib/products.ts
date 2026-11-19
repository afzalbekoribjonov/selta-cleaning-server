import { collection, onSnapshot, orderBy, query, doc, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'

export type CalcType = 'sqm' | 'meter' | 'kg' | 'count' | 'size'
export type ProductCategory = 'gilam' | 'parda' | 'boshqa'

export interface TariffPrice {
  unitPrice: number | null
  smallPrice: number | null
  largePrice: number | null
}

/** Ishbay: 1 birlik (m², metr, kg yoki dona) yuvish va qadoqlash narxi, so'm. */
export interface WorkRates {
  wash: number | null
  pack: number | null
}

export interface Product {
  id: string
  name: string
  calcType: CalcType
  category: ProductCategory
  tariffs: string[]
  pricesByTariff: Record<string, TariffPrice>
  workRates: WorkRates
}

/** Ishbay birligi — server lib/orderSummary.ts UNIT_BY_CALC_TYPE bilan bir xil. */
export const WORK_UNIT_LABEL: Record<CalcType, string> = { sqm: 'm²', meter: 'metr', kg: 'kg', count: 'dona', size: 'dona' }

export const CALC_TYPE_CONFIG: Record<CalcType, { label: string; unitLabel: string }> = {
  sqm: { label: 'Kvadrat metr', unitLabel: "so'm / m²" },
  meter: { label: 'Metr', unitLabel: "so'm / metr" },
  kg: { label: 'Kilogram', unitLabel: "so'm / kg" },
  count: { label: 'Soni', unitLabel: "so'm / dona" },
  size: { label: 'Kichik / Katta', unitLabel: "so'm" },
}

/** Ishchi mutaxassisligi shu toifalar bo'yicha belgilanadi (EmployeeDetailPage). */
export const PRODUCT_CATEGORY_CONFIG: Record<ProductCategory, { label: string }> = {
  gilam: { label: 'Gilam' },
  parda: { label: 'Parda' },
  boshqa: { label: 'Boshqa' },
}

function toProduct(doc: QueryDocumentSnapshot<DocumentData>): Product {
  const data = doc.data()
  const pricesByTariff: Record<string, TariffPrice> = {}
  const raw = (data.pricesByTariff ?? {}) as Record<string, Partial<TariffPrice>>
  for (const [tariff, p] of Object.entries(raw)) {
    pricesByTariff[tariff] = {
      unitPrice: p.unitPrice ?? null,
      smallPrice: p.smallPrice ?? null,
      largePrice: p.largePrice ?? null,
    }
  }
  return {
    id: doc.id,
    name: data.name ?? '',
    calcType: (data.calcType ?? 'count') as CalcType,
    category: (data.category ?? 'boshqa') as ProductCategory,
    tariffs: data.tariffs ?? [],
    pricesByTariff,
    workRates: {
      wash: typeof data.workRates?.wash === 'number' && data.workRates.wash > 0 ? data.workRates.wash : null,
      pack: typeof data.workRates?.pack === 'number' && data.workRates.pack > 0 ? data.workRates.pack : null,
    },
  }
}

/** Katalog odatda kichik (o'nlab mahsulot) — sahifalash shart emas. */
export function subscribeProducts(callback: (products: Product[]) => void) {
  const q = query(collection(db, 'products'), orderBy('name'))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toProduct)))
}

export interface ConditionSurcharges {
  average: number
  bad: number
  veryBad: number
}

export function subscribeConditionSurcharges(callback: (s: ConditionSurcharges) => void) {
  return onSnapshot(doc(db, 'settings', 'conditionSurcharges'), (snap) => {
    const data = snap.data()
    callback({ average: data?.average ?? 0, bad: data?.bad ?? 0, veryBad: data?.veryBad ?? 0 })
  })
}

import { collection, onSnapshot, orderBy, query, doc, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'

export type CalcType = 'sqm' | 'meter' | 'kg' | 'count' | 'size'
export type ProductCategory = 'gilam' | 'parda' | 'boshqa'

export interface TariffPrice {
  unitPrice: number | null
  smallPrice: number | null
  largePrice: number | null
}

export interface Product {
  id: string
  name: string
  calcType: CalcType
  category: ProductCategory
  tariffs: string[]
  pricesByTariff: Record<string, TariffPrice>
}

export const CALC_TYPE_LABELS: Record<CalcType, string> = {
  sqm: 'm²',
  meter: 'metr',
  kg: 'kg',
  count: 'soni',
  size: 'kichik/katta',
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
  }
}

export function priceFor(product: Product, tariff: string): TariffPrice {
  return product.pricesByTariff[tariff] ?? { unitPrice: null, smallPrice: null, largePrice: null }
}

export function appliesToTariff(product: Product, tariff: string): boolean {
  return product.tariffs.includes(tariff)
}

export function subscribeProducts(callback: (products: Product[]) => void) {
  const q = query(collection(db, 'products'), orderBy('name'))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toProduct)))
}

export interface ConditionSurcharges {
  average: number
  bad: number
  veryBad: number
}

export function percentFor(surcharges: ConditionSurcharges, condition: string | null): number {
  if (condition === 'average') return surcharges.average
  if (condition === 'bad') return surcharges.bad
  if (condition === 'veryBad') return surcharges.veryBad
  return 0
}

export function subscribeConditionSurcharges(callback: (s: ConditionSurcharges) => void) {
  return onSnapshot(doc(db, 'settings', 'conditionSurcharges'), (snap) => {
    const data = snap.data()
    callback({ average: data?.average ?? 0, bad: data?.bad ?? 0, veryBad: data?.veryBad ?? 0 })
  })
}

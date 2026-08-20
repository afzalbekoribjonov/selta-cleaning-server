import { collection, onSnapshot, orderBy, query, doc, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'

export type CalcType = 'sqm' | 'meter' | 'kg' | 'count' | 'size'

export interface TariffPrice {
  unitPrice: number | null
  smallPrice: number | null
  largePrice: number | null
}

export interface Product {
  id: string
  name: string
  calcType: CalcType
  tariffs: string[]
  pricesByTariff: Record<string, TariffPrice>
}

export const CALC_TYPE_CONFIG: Record<CalcType, { label: string; unitLabel: string }> = {
  sqm: { label: 'Kvadrat metr', unitLabel: "so'm / m²" },
  meter: { label: 'Metr', unitLabel: "so'm / metr" },
  kg: { label: 'Kilogram', unitLabel: "so'm / kg" },
  count: { label: 'Soni', unitLabel: "so'm / dona" },
  size: { label: 'Kichik / Katta', unitLabel: "so'm" },
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
    tariffs: data.tariffs ?? [],
    pricesByTariff,
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

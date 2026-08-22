import { collection, onSnapshot, orderBy, query, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Buyurtma "Manba"si (talab: marketing statistikasi) — endi admin panel
 * orqali qo'shiladi/o'chiriladi (avval qattiq kodlangan 5 ta variant
 * edi). mobile/lib/core/services/catalog_repository.dart (orderSourcesProvider)
 * bilan bir xil kolleksiya.
 */
export interface OrderSource {
  id: string
  name: string
  color: string
}

function toOrderSource(doc: QueryDocumentSnapshot<DocumentData>): OrderSource {
  const data = doc.data()
  return { id: doc.id, name: data.name ?? '', color: data.color ?? '#7A7482' }
}

export function subscribeOrderSources(callback: (sources: OrderSource[]) => void) {
  const q = query(collection(db, 'orderSources'), orderBy('name'))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toOrderSource)))
}

/**
 * Yangi manba qo'shishda tanlash uchun — CVD-xavfsizligi
 * `validate_palette.js --pairs all` bilan tekshirilgan (hammasi birga
 * ishlatilganda ham bir-biridan ajralib turadi).
 */
export const ORDER_SOURCE_COLOR_SWATCHES = ['#C13584', '#229ED9', '#1E9E5A', '#8C5AC3', '#CA8A04']

import { collection, onSnapshot, orderBy, query, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'

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

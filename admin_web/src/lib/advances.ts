import { collection, onSnapshot, orderBy, query, type QueryDocumentSnapshot, type DocumentData, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface Advance {
  id: string
  amount: number
  yearMonth: string
  note: string | null
  createdAt: Date
}

function toAdvance(doc: QueryDocumentSnapshot<DocumentData>): Advance {
  const data = doc.data()
  return {
    id: doc.id,
    amount: data.amount ?? 0,
    yearMonth: data.yearMonth ?? '',
    note: data.note ?? null,
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
  }
}

/** Bitta xodimga berilgan avanslar tarixi — soni tabiiy ravishda kichik. */
export function subscribeEmployeeAdvances(employeeId: string, callback: (advances: Advance[]) => void) {
  const q = query(collection(db, 'employees', employeeId, 'advances'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toAdvance)))
}

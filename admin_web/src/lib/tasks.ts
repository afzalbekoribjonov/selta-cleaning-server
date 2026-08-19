import { collection, onSnapshot, query, where, type QueryDocumentSnapshot, type DocumentData, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface Task {
  id: string
  type: 'single' | 'monthly'
  title: string
  description: string | null
  dueDate: Date | null
  scheduledDate: Date | null
  monthKey: string | null
  status: 'pending' | 'done' | 'delayed'
  delayNote: string | null
  completedAt: Date | null
  createdAt: Date
}

function toTask(doc: QueryDocumentSnapshot<DocumentData>): Task {
  const data = doc.data()
  return {
    id: doc.id,
    type: data.type === 'monthly' ? 'monthly' : 'single',
    title: data.title ?? '',
    description: data.description ?? null,
    dueDate: (data.dueDate as Timestamp | undefined)?.toDate() ?? null,
    scheduledDate: (data.scheduledDate as Timestamp | undefined)?.toDate() ?? null,
    monthKey: data.monthKey ?? null,
    status: data.status ?? 'pending',
    delayNote: data.delayNote ?? null,
    completedAt: (data.completedAt as Timestamp | undefined)?.toDate() ?? null,
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
  }
}

/**
 * "Boshqa" bo'limdagi bitta xodimga tayinlangan topshiriqlar — real-vaqtli
 * (xodim soni kam bo'lgani uchun cheklov shart emas, bitta xodimga
 * tegishlisi allaqachon tabiiy ravishda kichik).
 */
export function subscribeEmployeeTasks(employeeId: string, callback: (tasks: Task[]) => void) {
  const q = query(collection(db, 'tasks'), where('employeeId', '==', employeeId))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toTask)))
}

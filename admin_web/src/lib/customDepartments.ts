import { collection, onSnapshot, query, limit, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from './firebase'

export interface CustomDepartment {
  id: string
  label: string
  includeInStats: boolean
}

function toCustomDepartment(doc: QueryDocumentSnapshot<DocumentData>): CustomDepartment {
  const data = doc.data()
  return { id: doc.id, label: data.label ?? doc.id, includeInStats: !!data.includeInStats }
}

/**
 * "Boshqa" orqali yaratilgan kasblar reestri — admin panelda bo'lim
 * kalitidan (masalan "buxgalter") o'qiladigan nom va statistikaga
 * qo'shish belgisini olish uchun. Kichik ro'yxat, cheklangan oyna yetarli.
 */
export function subscribeCustomDepartments(callback: (departments: CustomDepartment[]) => void) {
  const q = query(collection(db, 'customDepartments'), limit(200))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toCustomDepartment)))
}

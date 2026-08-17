import { collection, onSnapshot, orderBy, query, limit, type QueryDocumentSnapshot, type DocumentData, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface Expense {
  id: string
  name: string
  amount: number
  date: Date
  recurring: boolean
}

function toExpense(doc: QueryDocumentSnapshot<DocumentData>): Expense {
  const data = doc.data()
  return {
    id: doc.id,
    name: data.name ?? '',
    amount: data.amount ?? 0,
    date: (data.date as Timestamp | undefined)?.toDate() ?? new Date(),
    recurring: !!data.recurring,
  }
}

/**
 * Chiqimlar odatda kichik ro'yxat (o'nlab-yuzlab yozuv) — real-vaqtli,
 * cheklangan (500 tagacha) oyna, "hammasi birdaniga yuklanmasin" qoidasiga
 * mos.
 */
export function subscribeExpenses(callback: (expenses: Expense[]) => void) {
  const q = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(500))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toExpense)))
}

/**
 * Berilgan oy (0-indeksli) uchun chiqimlarni hisoblaydi: bir martalik
 * chiqimlar aynan shu oyga tegishli bo'lsa, takrorlanuvchi chiqimlar esa
 * boshlangan sanasidan keyingi HAR oyda (shu oy ham kiradi) hisobga
 * olinadi — cheksiz takrorlanadi, admin o'chirmaguncha.
 */
export function computeMonthlyExpenses(expenses: Expense[], year: number, month: number): { total: number; items: Expense[] } {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 1)

  const items = expenses.filter((e) => {
    if (e.recurring) return e.date < monthEnd
    return e.date >= monthStart && e.date < monthEnd
  })

  return { total: items.reduce((s, e) => s + e.amount, 0), items }
}

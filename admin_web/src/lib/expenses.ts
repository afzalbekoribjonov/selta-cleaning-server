import {
  collection,
  getAggregateFromServer,
  onSnapshot,
  orderBy,
  query,
  sum,
  where,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { businessDateKey, businessDayRange, businessMonthRange } from './business-time'
import { lastDayOfMonth, type DateRange } from './uz-dates'

export interface Expense {
  id: string
  name: string
  amount: number
  date: Date
  recurring: boolean
  /** Ilovadan xodim kiritgan chiqim — kim kiritgani. Admin chiqimida `null`. */
  employeeId: string | null
  note: string | null
  /** Xodim qo'lidagi naqddan to'langan — o'sha kungi topshiriladigan naqddan ayiriladi. */
  fromCash: boolean
}

function toExpense(doc: QueryDocumentSnapshot<DocumentData>): Expense {
  const data = doc.data()
  return {
    id: doc.id,
    name: data.name ?? '',
    amount: data.amount ?? 0,
    date: (data.date as Timestamp | undefined)?.toDate() ?? new Date(),
    recurring: !!data.recurring,
    employeeId: typeof data.employeeId === 'string' ? data.employeeId : null,
    note: typeof data.note === 'string' ? data.note : null,
    fromCash: data.fromCash === true,
  }
}

// ---------------------------------------------------------------------------
// Davr bo'yicha (Chiqimlar sahifasi): faqat tanlangan davr o'qiladi.
// ---------------------------------------------------------------------------

/**
 * Davrdagi bir martalik chiqimlar (jonli). `date` bo'yicha oraliq —
 * bitta maydon indeksi yetarli. Takrorlanuvchilar alohida
 * ([subscribeRecurringExpenses]) — ular davrga "har oy" sifatida tushadi.
 */
export function subscribeExpensesInRange(range: DateRange, callback: (expenses: Expense[]) => void, onError?: (e: Error) => void) {
  const q = query(
    collection(db, 'expenses'),
    where('date', '>=', Timestamp.fromDate(businessDayRange(range.from).start)),
    where('date', '<', Timestamp.fromDate(businessDayRange(range.to).end)),
    orderBy('date', 'desc'),
  )
  return onSnapshot(q, (snap) => callback(snap.docs.map(toExpense).filter((e) => !e.recurring)), onError)
}

export function subscribeRecurringExpenses(callback: (expenses: Expense[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'expenses'), where('recurring', '==', true))
  return onSnapshot(q, (snap) => callback(snap.docs.map(toExpense)), onError)
}

/** Chiqim davrdagi qaysi kunga tushadi (takrorlanuvchida — har oyning shu kuni). */
export interface ExpenseEntry {
  expense: Expense
  dayKey: string
}

/**
 * Davr yozuvlari: bir martalik — o'z kunida; takrorlanuvchi — boshlangan
 * oyidan boshlab har oyning o'sha kunida (oy qisqa bo'lsa — oxirgi kuni).
 * Butun oy tanlanganda [computeMonthlyExpenses] bilan bir xil natija.
 */
export function expenseEntries(oneTime: Expense[], recurring: Expense[], range: DateRange): ExpenseEntry[] {
  const out: ExpenseEntry[] = oneTime.map((expense) => ({ expense, dayKey: businessDateKey(expense.date) }))
  for (const expense of recurring) {
    const startKey = businessDateKey(expense.date)
    const startDay = Number(startKey.slice(8))
    let ym = range.from.slice(0, 7)
    const lastYm = range.to.slice(0, 7)
    while (ym <= lastYm) {
      const last = lastDayOfMonth(ym)
      const day = Math.min(startDay, Number(last.slice(8)))
      const dayKey = `${ym}-${String(day).padStart(2, '0')}`
      if (dayKey >= range.from && dayKey <= range.to && dayKey >= startKey) out.push({ expense, dayKey })
      const [y, m] = ym.split('-').map(Number)
      ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    }
  }
  return out.sort((a, b) => b.dayKey.localeCompare(a.dayKey) || b.expense.date.getTime() - a.expense.date.getTime())
}

/**
 * Oylar jami — har oy uchun bitta yig'ma so'rov (sum), hujjatlar
 * o'qilmaydi: bir martalik + o'sha oyda amalda bo'lgan takrorlanuvchilar.
 * Yig'ma so'rov takrorlanuvchini faqat boshlangan oyida sanaydi — u
 * ayirilib, qoidaga ko'ra qayta qo'shiladi.
 */
export async function fetchMonthTotals(months: string[], recurring: Expense[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    months.map(async (ym) => {
      const { start, end } = businessMonthRange(ym)
      const snap = await getAggregateFromServer(
        query(collection(db, 'expenses'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<', Timestamp.fromDate(end))),
        { total: sum('amount') },
      )
      const startedHere = recurring.filter((e) => e.date >= start && e.date < end).reduce((s, e) => s + e.amount, 0)
      const active = recurring.filter((e) => e.date < end).reduce((s, e) => s + e.amount, 0)
      return [ym, (snap.data().total ?? 0) - startedHere + active] as const
    }),
  )
  return Object.fromEntries(entries)
}

/** Nomi bo'yicha guruh kaliti: "Yoqilg'i " va "yoqilg'i" — bitta tur. */
export const expenseKindKey = (name: string) => name.trim().toLowerCase()

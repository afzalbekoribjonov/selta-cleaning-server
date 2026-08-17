import { useEffect, useState } from 'react'
import { collection, collectionGroup, getAggregateFromServer, getDocs, query, sum, count, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { computeMonthlyExpenses, type Expense } from '@/lib/expenses'

export interface MonthReport {
  year: number
  month: number // 0-indeksli
  label: string
  orderCount: number
  revenue: number
  payroll: number
  payrollComputed: boolean
  expenses: number
  profit: number
}

/**
 * Bir yilning barcha oylari uchun: tushum+buyurtma soni (Firestore
 * aggregatsiya — hujjatlar yuklanmaydi), oylik maosh (barcha xodimlarning
 * payrollRuns'i — collection-group so'rov, bitta chaqiruvda), va chiqimlar
 * (allaqachon yuklangan cheklangan ro'yxatdan hisoblanadi).
 */
export function useYearlyReport(year: number, expenses: Expense[] | null) {
  const [months, setMonths] = useState<MonthReport[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (expenses === null) return
    const expenseList = expenses
    let cancelled = false

    async function load() {
      try {
        const revenueByMonth = await Promise.all(
          Array.from({ length: 12 }, async (_, month) => {
            const start = new Date(year, month, 1)
            const end = new Date(year, month + 1, 1)
            const q = query(
              collection(db, 'orders'),
              where('createdAt', '>=', Timestamp.fromDate(start)),
              where('createdAt', '<', Timestamp.fromDate(end)),
            )
            const snap = await getAggregateFromServer(q, { revenue: sum('totalPrice'), count: count() })
            return { revenue: snap.data().revenue ?? 0, orderCount: snap.data().count ?? 0 }
          }),
        )

        const payrollByMonth: Record<string, number> = {}
        const computedMonths = new Set<string>()
        const yearPrefix = String(year)
        const payrollSnap = await getDocs(
          query(
            collectionGroup(db, 'payrollRuns'),
            where('yearMonth', '>=', `${yearPrefix}-01`),
            where('yearMonth', '<=', `${yearPrefix}-12`),
          ),
        )
        payrollSnap.docs.forEach((d) => {
          const data = d.data()
          const ym = data.yearMonth as string
          payrollByMonth[ym] = (payrollByMonth[ym] ?? 0) + (data.amount ?? 0)
          computedMonths.add(ym)
        })

        const result: MonthReport[] = Array.from({ length: 12 }, (_, month) => {
          const ym = `${year}-${String(month + 1).padStart(2, '0')}`
          const { total: expenseTotal } = computeMonthlyExpenses(expenseList, year, month)
          const payroll = payrollByMonth[ym] ?? 0
          const revenue = revenueByMonth[month].revenue
          return {
            year,
            month,
            label: UZ_MONTHS_FULL[month],
            orderCount: revenueByMonth[month].orderCount,
            revenue,
            payroll,
            payrollComputed: computedMonths.has(ym),
            expenses: expenseTotal,
            profit: revenue - payroll - expenseTotal,
          }
        })

        if (!cancelled) setMonths(result)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useYearlyReport failed:', err)
        if (!cancelled) setError(err as Error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [year, expenses])

  return { months, loading: months === null && !error, error }
}

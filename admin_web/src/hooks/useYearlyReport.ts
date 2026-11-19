import { useEffect, useState } from 'react'
import { collection, collectionGroup, getAggregateFromServer, getDocs, query, sum, count, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { businessMonthRange } from '@/lib/business-time'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { fetchMonthTotals, type Expense } from '@/lib/expenses'

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
 * (har oy — yig'ma so'rov + takrorlanuvchilar; avval "oxirgi 500 ta"
 * ro'yxatdan hisoblanardi va eski doimiy to'lovlar tushib qolardi).
 */
export function useYearlyReport(year: number, recurring: Expense[] | null) {
  const [months, setMonths] = useState<MonthReport[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (recurring === null) return
    const recurringList = recurring
    let cancelled = false

    async function load() {
      try {
        const revenueByMonth = await Promise.all(
          Array.from({ length: 12 }, async (_, month) => {
            // Oy chegarasi biznes vaqti (UTC+5) bo'yicha — brauzer zonasi boshqa bo'lsa ham.
            const { start, end } = businessMonthRange(`${year}-${String(month + 1).padStart(2, '0')}`)
            const q = query(
              collection(db, 'orders'),
              where('createdAt', '>=', Timestamp.fromDate(start)),
              where('createdAt', '<', Timestamp.fromDate(end)),
            )
            const snap = await getAggregateFromServer(q, { revenue: sum('totalPrice'), count: count() })
            return { revenue: snap.data().revenue ?? 0, orderCount: snap.data().count ?? 0 }
          }),
        )

        const expenseByMonth = await fetchMonthTotals(
          Array.from({ length: 12 }, (_, month) => `${year}-${String(month + 1).padStart(2, '0')}`),
          recurringList,
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
          const expenseTotal = expenseByMonth[ym] ?? 0
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
  }, [year, recurring])

  return { months, loading: months === null && !error, error }
}

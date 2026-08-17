import { useEffect, useState } from 'react'
import { collection, getAggregateFromServer, query, sum, count, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { UZ_MONTHS_SHORT } from '@/lib/date-utils'

export interface MonthlyRevenue {
  month: string // "2026-03"
  label: string // "Mar"
  revenue: number
  orderCount: number
  projected?: boolean
}

/**
 * Oxirgi 6 oyning haqiqiy tushumini Firestore aggregatsiya so'rovlari
 * orqali hisoblaydi — buyurtma hujjatlarining o'zi hech qachon klientga
 * yuklanmaydi (faqat sum/count natijasi), shuning uchun "barcha
 * buyurtmalar birdaniga yuklanmasin" qoidasini buzmaydi.
 */
export function useMonthlyRevenue(monthsBack = 6) {
  const [data, setData] = useState<MonthlyRevenue[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const now = new Date()
        const months: { start: Date; end: Date; key: string; label: string }[] = []
        for (let i = monthsBack - 1; i >= 0; i--) {
          const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
          months.push({
            start,
            end,
            key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
            label: UZ_MONTHS_SHORT[start.getMonth()],
          })
        }

        const results = await Promise.all(
          months.map(async ({ start, end, key, label }) => {
            const q = query(
              collection(db, 'orders'),
              where('createdAt', '>=', Timestamp.fromDate(start)),
              where('createdAt', '<', Timestamp.fromDate(end)),
            )
            const snap = await getAggregateFromServer(q, { revenue: sum('totalPrice'), count: count() })
            return { month: key, label, revenue: snap.data().revenue ?? 0, orderCount: snap.data().count ?? 0 }
          }),
        )

        if (!cancelled) setData(results)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useMonthlyRevenue failed:', err)
        if (!cancelled) setError(err as Error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [monthsBack])

  return { data, loading: data === null && !error, error }
}

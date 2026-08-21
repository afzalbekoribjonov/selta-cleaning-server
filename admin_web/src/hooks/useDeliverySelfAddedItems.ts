import { useEffect, useState } from 'react'
import { collection, getDocs, query, where, limit as fbLimit, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface MonthlySelfAddedStats {
  yearMonth: string // "2026-08"
  count: number
  revenue: number
}

/**
 * Dastavchik o'zi (mijoz oldida, sotuv menejeri oldindan qo'shmagan)
 * qo'shgan mahsulotlar — oyma-oy soni va summasi (talab #7). Avval
 * `deliveryAddedByEmployees array-contains` bilan shu xodim ishtirok
 * etgan buyurtmalarni topadi (addOrderItems: arrayUnion), so'ng har bir
 * shunday buyurtmaning items subkolleksiyasini o'qib, aynan shu xodim
 * ("addedBy" + "addedByDepartment") qo'shgan itemlarni ajratadi —
 * collection-group so'rovsiz (order-scoped o'qishlar, qo'shimcha
 * xavfsizlik qoidasi shart emas).
 */
export function useDeliverySelfAddedItems(employeeId: string) {
  const [stats, setStats] = useState<MonthlySelfAddedStats[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setStats(null)

    async function load() {
      const ordersSnap = await getDocs(
        query(collection(db, 'orders'), where('deliveryAddedByEmployees', 'array-contains', employeeId), fbLimit(200)),
      )
      const itemsSnaps = await Promise.all(ordersSnap.docs.map((d) => getDocs(collection(db, 'orders', d.id, 'items'))))

      const byMonth: Record<string, { count: number; revenue: number }> = {}
      for (const itemsSnap of itemsSnaps) {
        for (const itemDoc of itemsSnap.docs) {
          const data = itemDoc.data()
          if (data.addedBy !== employeeId || data.addedByDepartment !== 'delivery') continue
          const createdAt = (data.createdAt as Timestamp | undefined)?.toDate()
          if (!createdAt) continue
          const yearMonth = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
          const entry = byMonth[yearMonth] ?? { count: 0, revenue: 0 }
          entry.count += 1
          entry.revenue += (data.price as number) ?? 0
          byMonth[yearMonth] = entry
        }
      }

      if (cancelled) return
      setStats(
        Object.entries(byMonth)
          .map(([yearMonth, v]) => ({ yearMonth, ...v }))
          .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1)),
      )
    }

    load().catch(() => {
      if (!cancelled) setStats([])
    })
    return () => {
      cancelled = true
    }
  }, [employeeId])

  return { stats, loading: stats === null }
}

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where, limit as fbLimit, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DEPARTMENT_ATTRIBUTION_FIELD } from '@/lib/employees'

export interface AttributedOrder {
  id: string
  orderNumber: number
  customerName: string
  tariff: string
  status: string
  createdAt: Date
  totalPrice: number
}

/**
 * Xodimning bo'limiga mos maydon (createdBy tenglik bilan;
 * washedByEmployees/deliveredByEmployees array-contains bilan) bo'yicha
 * unga tegishli buyurtmalarni oladi — cheklangan (300 tagacha) real-vaqtli
 * oyna, "hammasi birdaniga yuklanmasin" qoidasiga mos.
 *
 * array-contains so'rovlarda `orderBy('createdAt')` ataylab ishlatilmaydi
 * — bu Firestore'da qo'shimcha composite indeks talab qilar edi (loyihada
 * indekslar konsolda qo'lda boshqariladi); buning o'rniga kichik oynani
 * mijoz tomonida saralaymiz.
 */
export function useEmployeeOrders(employeeId: string, department: string) {
  const [orders, setOrders] = useState<AttributedOrder[] | null>(null)

  useEffect(() => {
    setOrders(null)
    const attribution = DEPARTMENT_ATTRIBUTION_FIELD[department]
    if (!attribution) {
      setOrders([])
      return
    }

    const constraints =
      attribution.mode === 'array-contains'
        ? [where(attribution.field, 'array-contains', employeeId), fbLimit(300)]
        : [where(attribution.field, '==', employeeId), orderBy('createdAt', 'desc'), fbLimit(300)]
    const q = query(collection(db, 'orders'), ...constraints)
    const unsubscribe = onSnapshot(q, (snap) => {
      const mapped = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          orderNumber: data.orderNumber ?? 0,
          customerName: data.customerName ?? '',
          tariff: data.tariff ?? 'standart',
          status: data.status ?? 'new',
          createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
          totalPrice: data.totalPrice ?? 0,
        }
      })
      mapped.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setOrders(mapped)
    })
    return unsubscribe
  }, [employeeId, department])

  return { orders, loading: orders === null }
}

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
 * Xodimning bo'limiga mos maydon (createdBy/washedBy/deliveredBy/
 * qcRatedBy) bo'yicha unga tegishli buyurtmalarni oladi — cheklangan
 * (300 tagacha) real-vaqtli oyna, "hammasi birdaniga yuklanmasin"
 * qoidasiga mos.
 */
export function useEmployeeOrders(employeeId: string, department: string) {
  const [orders, setOrders] = useState<AttributedOrder[] | null>(null)

  useEffect(() => {
    setOrders(null)
    const field = DEPARTMENT_ATTRIBUTION_FIELD[department]
    if (!field) {
      setOrders([])
      return
    }

    const q = query(collection(db, 'orders'), where(field, '==', employeeId), orderBy('createdAt', 'desc'), fbLimit(300))
    const unsubscribe = onSnapshot(q, (snap) => {
      setOrders(
        snap.docs.map((d) => {
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
        }),
      )
    })
    return unsubscribe
  }, [employeeId, department])

  return { orders, loading: orders === null }
}

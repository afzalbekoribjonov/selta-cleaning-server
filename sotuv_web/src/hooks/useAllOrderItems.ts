import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface StatsItem {
  id: string
  price: number
  status?: string
  tariff?: string
  dueDate?: Date
}

function toStatsItem(id: string, d: Record<string, unknown>): StatsItem {
  return {
    id,
    price: (d.price as number) ?? 0,
    status: d.status as string | undefined,
    tariff: d.tariff as string | undefined,
    dueDate: (d.dueDate as Timestamp | undefined)?.toDate(),
  }
}

/**
 * admin_web/src/hooks/useAllOrderItems.ts bilan bir xil naqsh — berilgan
 * buyurtmalar ro'yxatining barcha items'larini real-vaqtli kuzatadi (har
 * bir buyurtma uchun alohida onSnapshot). Pickup buyurtmalarda tarif/muddat
 * item-darajasida bo'lgani uchun ro'yxatda to'g'ri ko'rsatish uchun kerak.
 */
export function useAllOrderItems(orderIds: string[]): Record<string, StatsItem[]> {
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, StatsItem[]>>({})
  const unsubsRef = useRef<Record<string, () => void>>({})
  const idsKey = orderIds.slice().sort().join(',')

  useEffect(() => {
    const currentIds = new Set(orderIds)

    for (const id of Object.keys(unsubsRef.current)) {
      if (!currentIds.has(id)) {
        unsubsRef.current[id]()
        delete unsubsRef.current[id]
        setItemsByOrder((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    }

    for (const id of orderIds) {
      if (!unsubsRef.current[id]) {
        const q = query(collection(db, 'orders', id, 'items'))
        unsubsRef.current[id] = onSnapshot(q, (snap) => {
          setItemsByOrder((prev) => ({ ...prev, [id]: snap.docs.map((d) => toStatsItem(d.id, d.data())) }))
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  useEffect(() => {
    return () => {
      for (const unsub of Object.values(unsubsRef.current)) unsub()
    }
  }, [])

  return itemsByOrder
}

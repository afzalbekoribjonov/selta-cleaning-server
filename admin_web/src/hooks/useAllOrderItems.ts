import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface StatsItem {
  id: string
  price: number
  washedBy?: string
  washedAt?: Date
  qcBy?: string
  qcAt?: Date
  deliveredBy?: string
  deliveredAt?: Date
}

function toStatsItem(id: string, d: Record<string, unknown>): StatsItem {
  return {
    id,
    price: (d.price as number) ?? 0,
    washedBy: d.washedBy as string | undefined,
    washedAt: (d.washedAt as Timestamp | undefined)?.toDate(),
    qcBy: d.qcBy as string | undefined,
    qcAt: (d.qcAt as Timestamp | undefined)?.toDate(),
    deliveredBy: d.deliveredBy as string | undefined,
    deliveredAt: (d.deliveredAt as Timestamp | undefined)?.toDate(),
  }
}

/**
 * Berilgan buyurtmalar ro'yxatining BARCHA items'larini real-vaqtli
 * kuzatadi (har bir buyurtma uchun alohida onSnapshot, mobil ilovadagi
 * xodim faolligi kabi naqsh — collection-group so'rovsiz, qo'shimcha
 * xavfsizlik qoidasi shart emas). Xodim faolligi statistikasi (kim
 * yuvgan/yetkazgan/ishlov bergan) item-darajasidagi maydonlarga
 * asoslangani uchun kerak.
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

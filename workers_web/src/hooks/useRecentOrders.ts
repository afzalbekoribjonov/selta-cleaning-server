import { useEffect, useMemo, useState } from 'react'
import { subscribeActiveOrders, subscribeRecentOrders, type Order } from '@/lib/orders'
import { useAuth } from '@/lib/auth-context'

/**
 * Ikkita manbani birlashtiradi: FAOL buyurtmalar (holat bo'yicha, to'liq —
 * hech qachon "oxirgi N ta" oynasidan tushib qolmaydi) va oxirgi 150 ta
 * buyurtma (yakunlanganlari bilan, qidiruv uchun).
 */
export function useRecentOrders() {
  const { user } = useAuth()
  const [active, setActive] = useState<Order[] | null>(null)
  const [recent, setRecent] = useState<Order[] | null>(null)

  useEffect(() => {
    if (!user) {
      setActive(null)
      setRecent(null)
      return
    }
    const unsubActive = subscribeActiveOrders(setActive)
    const unsubRecent = subscribeRecentOrders(setRecent)
    return () => {
      unsubActive()
      unsubRecent()
    }
  }, [user])

  const merged = useMemo(() => {
    const byId = new Map<string, Order>()
    for (const o of active ?? []) byId.set(o.id, o)
    for (const o of recent ?? []) if (!byId.has(o.id)) byId.set(o.id, o)
    return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }, [active, recent])

  return { orders: merged, activeOrders: active ?? [], loading: active === null }
}

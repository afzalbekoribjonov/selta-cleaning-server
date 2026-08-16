import { useEffect, useState } from 'react'
import { subscribeRecentOrders, type Order } from '@/lib/orders'

/** Dashboard va Buyurtmalar sahifasi baham ko'radigan real-vaqtli oyna. */
export function useRecentOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeRecentOrders(setOrders)
    return unsubscribe
  }, [])

  return { orders, loading: orders === null }
}

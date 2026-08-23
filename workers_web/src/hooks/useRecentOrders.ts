import { useEffect, useState } from 'react'
import { subscribeRecentOrders, type Order } from '@/lib/orders'
import { useAuth } from '@/lib/auth-context'

export function useRecentOrders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    if (!user) {
      setOrders(null)
      return
    }
    return subscribeRecentOrders(setOrders)
  }, [user])

  return { orders: orders ?? [], loading: orders === null }
}

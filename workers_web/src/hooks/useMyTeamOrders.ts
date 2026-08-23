import { useEffect, useState } from 'react'
import { subscribeMyTeamOrders, type Order } from '@/lib/orders'
import { useAuth } from '@/lib/auth-context'

export function useMyTeamOrders() {
  const { claims } = useAuth()
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    if (!claims) {
      setOrders(null)
      return
    }
    return subscribeMyTeamOrders(claims.employeeId, setOrders)
  }, [claims])

  return orders ?? []
}

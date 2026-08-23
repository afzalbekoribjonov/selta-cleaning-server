import { useEffect, useState } from 'react'
import { subscribeOrderItems, type OrderItem } from '@/lib/order-items'

export function useOrderItems(orderId: string | null) {
  const [items, setItems] = useState<OrderItem[] | null>(null)

  useEffect(() => {
    if (!orderId) {
      setItems(null)
      return
    }
    setItems(null)
    return subscribeOrderItems(orderId, setItems)
  }, [orderId])

  return { items: items ?? [], loading: items === null }
}

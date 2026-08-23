import { useEffect, useState } from 'react'
import { subscribeOrder, type Order } from '@/lib/orders'

/** Bitta buyurtmani jonli kuzatadi — detail panel ochiq turganda boshqa joydan (mobil ilova) o'zgarsa ham yangilanadi. */
export function useOrder(orderId: string | null) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined)

  useEffect(() => {
    if (!orderId) {
      setOrder(undefined)
      return
    }
    setOrder(undefined)
    return subscribeOrder(orderId, setOrder)
  }, [orderId])

  return order
}

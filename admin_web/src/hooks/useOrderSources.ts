import { useEffect, useState } from 'react'
import { subscribeOrderSources, type OrderSource } from '@/lib/order-sources'

export function useOrderSources() {
  const [sources, setSources] = useState<OrderSource[] | null>(null)

  useEffect(() => {
    return subscribeOrderSources(setSources)
  }, [])

  return { sources: sources ?? [], loading: sources === null }
}

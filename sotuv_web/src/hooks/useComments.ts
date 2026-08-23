import { useEffect, useState } from 'react'
import { subscribeComments } from '@/lib/orders'

export function useComments(orderId: string | null) {
  const [comments, setComments] = useState<Record<string, unknown>[] | null>(null)

  useEffect(() => {
    if (!orderId) {
      setComments(null)
      return
    }
    setComments(null)
    return subscribeComments(orderId, setComments)
  }, [orderId])

  return { comments: comments ?? [], loading: comments === null }
}

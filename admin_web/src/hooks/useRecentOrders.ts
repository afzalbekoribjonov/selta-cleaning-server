import { useEffect, useState } from 'react'
import { subscribeRecentOrders, subscribeActiveOrders, type Order } from '@/lib/orders'

/**
 * Dashboard statistikasi uchun — oxirgi 150 ta buyurtma, YAKUNLANGANLARI
 * bilan ("bugun yetgazildi/olindi" kabi ko'rsatkichlar shundan chiqadi).
 */
export function useRecentOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeRecentOrders(setOrders)
    return unsubscribe
  }, [])

  return { orders, loading: orders === null }
}

/**
 * "Faol buyurtmalar" ro'yxati uchun — holat bo'yicha to'liq so'raladi,
 * shuning uchun eski faol buyurtmalar ham hech qachon tushib qolmaydi.
 */
export function useActiveOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeActiveOrders(setOrders)
    return unsubscribe
  }, [])

  return { orders, loading: orders === null }
}

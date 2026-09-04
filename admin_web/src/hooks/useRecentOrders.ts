import { useEffect, useState } from 'react'
import { subscribeRecentOrders, subscribeActiveOrders, subscribeTodayOrders, type Order } from '@/lib/orders'

/**
 * Bitta Firestore obunasini bir nechta komponent BO'LISHIB ishlatishi.
 *
 * NEGA KERAK: bitta obunaga bir nechta komponent muhtoj bo'lishi mumkin
 * (masalan boshqaruv panelida `useRecentOrders` ikki joyda chaqirilardi
 * va bir xil 150 ta hujjat ikki marta o'qilardi). Endi birinchi
 * iste'molchi obunani ochadi, qolganlari darhol keshdagi qiymatni
 * oladi, oxirgisi ajralganda obuna yopiladi.
 */
function createSharedOrders(subscribe: (cb: (orders: Order[]) => void) => () => void) {
  let value: Order[] | null = null
  let unsubscribe: (() => void) | null = null
  const listeners = new Set<(orders: Order[]) => void>()

  return function useSharedOrders() {
    const [orders, setOrders] = useState<Order[] | null>(value)

    useEffect(() => {
      listeners.add(setOrders)
      // Kech qo'shilgan iste'molchi kutmasin — allaqachon kelgan
      // ma'lumot darhol beriladi.
      if (value !== null) setOrders(value)
      if (unsubscribe === null) {
        unsubscribe = subscribe((next) => {
          value = next
          for (const listener of listeners) listener(next)
        })
      }
      return () => {
        listeners.delete(setOrders)
        if (listeners.size === 0) {
          unsubscribe?.()
          unsubscribe = null
          // Kesh saqlanadi: keyingi ochilishda ekran bo'sh ko'rinmaydi,
          // yangi ma'lumot kelishi bilan almashadi.
        }
      }
    }, [])

    return { orders, loading: orders === null }
  }
}

/**
 * Dashboard statistikasi uchun — oxirgi 150 ta buyurtma, YAKUNLANGANLARI
 * bilan (bugungi buyurtmalar/tushum kabi ko'rsatkichlar shundan chiqadi).
 */
export const useRecentOrders = createSharedOrders(subscribeRecentOrders)

/**
 * "Faol buyurtmalar" ro'yxati uchun — holat bo'yicha to'liq so'raladi,
 * shuning uchun eski faol buyurtmalar ham hech qachon tushib qolmaydi.
 */
export const useActiveOrders = createSharedOrders(subscribeActiveOrders)

/**
 * Faqat BUGUN yaratilgan buyurtmalar — boshqaruv panelidagi kunlik
 * ikki ko'rsatkich uchun. Odatda o'nlab hujjat, 150 emas.
 */
export const useTodayOrders = createSharedOrders(subscribeTodayOrders)

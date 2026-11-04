import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Omborxona chegarasi — "Tayyor" holatiga o'tganiga shuncha kun bo'lgan
 * har bir mahsulot ALOHIDA omborga tushadi (butun buyurtma emas).
 * server/src/routes/warehouse.ts va ilovadagi warehouse_settings.dart
 * bilan bir xil standart qiymat.
 */
export const DEFAULT_WAREHOUSE_DAYS = 5

export function subscribeWarehouseDays(callback: (days: number) => void) {
  return onSnapshot(
    doc(db, 'settings', 'warehouse'),
    (snap) => {
      const value = snap.data()?.readyDays
      callback(typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365 ? value : DEFAULT_WAREHOUSE_DAYS)
    },
    () => callback(DEFAULT_WAREHOUSE_DAYS),
  )
}

export function updateWarehouseDays(readyDays: number) {
  return apiPost<{ ok: true; readyDays: number }>('/adminUpdateWarehouseSettings', { readyDays })
}

/**
 * Mahsulot omborda turibdimi va necha kundan beri tayyor — ilovadagi
 * `warehouseDaysOf` bilan bir xil hisob (kalendar kunlari).
 */
export function readyDaysOf(readyAt: Date | null, now: Date = new Date()): number | null {
  if (!readyAt) return null
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor((day(now) - day(readyAt)) / 86_400_000)
}

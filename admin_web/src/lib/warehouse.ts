import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Omborxona chegarasi — barcha mahsulotlari tayyor buyurtma muddatidan
 * shuncha kundan KO'P o'tsa omborga tushadi. server/src/routes/warehouse.ts
 * va ilovadagi warehouse_settings.dart bilan bir xil standart qiymat.
 */
export const DEFAULT_WAREHOUSE_DAYS = 10

export function subscribeWarehouseDays(callback: (days: number) => void) {
  return onSnapshot(
    doc(db, 'settings', 'warehouse'),
    (snap) => {
      const value = snap.data()?.thresholdDays
      callback(typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365 ? value : DEFAULT_WAREHOUSE_DAYS)
    },
    () => callback(DEFAULT_WAREHOUSE_DAYS),
  )
}

export function updateWarehouseDays(thresholdDays: number) {
  return apiPost<{ ok: true; thresholdDays: number }>('/adminUpdateWarehouseSettings', { thresholdDays })
}

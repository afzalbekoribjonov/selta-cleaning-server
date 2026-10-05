import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Bonus (keshbek) foizi — yakunlangan buyurtma uchun haqiqatda olingan
 * puldan mijoz hisobiga yoziladigan ulush. server/src/lib/bonus.ts bilan
 * bir xil standart qiymat va chegara. 0 — bonus berish to'xtatiladi.
 */
export const DEFAULT_BONUS_PERCENT = 1
export const MAX_BONUS_PERCENT = 20

export function isValidBonusPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_BONUS_PERCENT
}

export function subscribeBonusPercent(callback: (percent: number) => void) {
  return onSnapshot(
    doc(db, 'settings', 'bonus'),
    (snap) => {
      const value = snap.data()?.percent
      callback(typeof value === 'number' && isValidBonusPercent(value) ? value : DEFAULT_BONUS_PERCENT)
    },
    () => callback(DEFAULT_BONUS_PERCENT),
  )
}

export function updateBonusPercent(percent: number) {
  return apiPost<{ ok: true; percent: number }>('/adminUpdateBonusSettings', { percent })
}

export interface CustomerBonus {
  balance: number
  earnedTotal: number
  spentTotal: number
  percent: number
}

export function fetchCustomerBonus(phone: string) {
  return apiPost<CustomerBonus>('/customerBonus', { phone })
}

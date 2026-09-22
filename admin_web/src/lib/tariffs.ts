import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Tarif sozlamalari — server/src/lib/tariffConfig.ts bilan AYNAN bir xil
 * shakl va bir xil standart qiymatlar.
 *
 * Hujjat (`settings/tariffs`) jonli o'qiladi: admin o'zgartirgan zahoti
 * barcha ochiq sahifalarda yangilanadi. Yozish esa server orqali —
 * tekshiruv bitta joyda turishi uchun (muddat hisobi ham o'sha
 * qiymatlarga tayanadi).
 */
export interface TariffSetting {
  /** Buyurtma muddati — mahsulot qo'shilgan kundan boshlab. */
  days: number
  /** Shu kungacha rang yashil (`elapsedDays < green`). */
  green: number
  /** Shu kungacha sariq, undan keyin qizil. */
  yellow: number
}

export type TariffConfig = Record<string, TariffSetting>

export const TARIFF_KEYS = ['express', 'comfort', 'standart', 'premium'] as const

export const DEFAULT_TARIFFS: TariffConfig = {
  express: { days: 4, green: 2, yellow: 3 },
  comfort: { days: 7, green: 3, yellow: 5 },
  standart: { days: 12, green: 4, yellow: 8 },
  premium: { days: 4, green: 2, yellow: 3 },
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/** Qoida serverdagi bilan bir xil: `1 <= green < yellow <= days`. */
export function validateTariffSetting(raw: unknown): TariffSetting | null {
  if (!raw || typeof raw !== 'object') return null
  const { days, green, yellow } = raw as Record<string, unknown>
  if (!isCount(days) || !isCount(green) || !isCount(yellow)) return null
  if (days < 1 || days > 365) return null
  if (green < 1 || green >= yellow || yellow > days) return null
  return { days, green, yellow }
}

export function mergeWithDefaults(data: Record<string, unknown> | undefined): TariffConfig {
  const merged: TariffConfig = {}
  for (const key of TARIFF_KEYS) {
    merged[key] = validateTariffSetting(data?.[key]) ?? DEFAULT_TARIFFS[key]
  }
  return merged
}

export function subscribeTariffs(callback: (config: TariffConfig) => void) {
  return onSnapshot(
    doc(db, 'settings', 'tariffs'),
    (snap) => callback(mergeWithDefaults(snap.data())),
    () => callback(DEFAULT_TARIFFS),
  )
}

export function updateTariffs(tariffs: TariffConfig) {
  return apiPost<{ ok: true; tariffs: TariffConfig }>('/adminUpdateTariffs', { tariffs })
}

/** "4 kunlik" — ro'yxatlarda va nishonchalarda ko'rsatish uchun. */
export function tariffDaysLabel(setting: TariffSetting | undefined): string {
  return setting ? `${setting.days} kunlik` : '—'
}

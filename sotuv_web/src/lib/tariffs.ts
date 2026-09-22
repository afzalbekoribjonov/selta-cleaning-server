import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Tarif sozlamalari — admin panelda boshqariladi, bu yerda faqat
 * O'QILADI (`settings/tariffs`, firestore.rules: isSignedIn).
 *
 * Shakl va standart qiymatlar server/src/lib/tariffConfig.ts bilan
 * aynan bir xil. Hujjat yo'q yoki buzuq bo'lsa standart qiymatlar
 * ishlatiladi, ya'ni hech narsa sozlanmagan tizim avvalgidek ishlaydi.
 */
export interface TariffSetting {
  days: number
  green: number
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
function validateTariffSetting(raw: unknown): TariffSetting | null {
  if (!raw || typeof raw !== 'object') return null
  const { days, green, yellow } = raw as Record<string, unknown>
  if (!isCount(days) || !isCount(green) || !isCount(yellow)) return null
  if (days < 1 || days > 365) return null
  if (green < 1 || green >= yellow || yellow > days) return null
  return { days, green, yellow }
}

function mergeWithDefaults(data: Record<string, unknown> | undefined): TariffConfig {
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

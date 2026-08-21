/**
 * mobile/lib/core/constants.dart dagi kStatusConfig/kTariffConfig bilan
 * 1:1 mos — ikkala tomon ham bir xil kalitlar/ranglar ishlatadi.
 */
export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Yangi', color: '#2F80D6', bg: '#E8F1FC' },
  picked_up: { label: 'Qabul qilindi', color: '#0E9488', bg: '#E3F8F6' },
  brought_in: { label: 'Sexga keldi', color: '#7A7482', bg: '#F1EFF3' },
  washing: { label: 'Yuvilmoqda', color: '#2F80D6', bg: '#E8F1FC' },
  packing: { label: 'Upakovka', color: '#8A5A00', bg: '#FBF0DC' },
  qc_review: { label: 'Sifat nazoratida', color: '#F59E0B', bg: '#FFF4E0' },
  ready: { label: 'Tayyor', color: '#1E9E5A', bg: '#E5F7EC' },
  team_assigned: { label: 'Jamoa biriktirildi', color: '#8C5AC3', bg: '#F1E9F8' },
  in_progress: { label: 'Jarayonda', color: '#2F80D6', bg: '#E8F1FC' },
  done: { label: 'Yakunlandi', color: '#1E9E5A', bg: '#E5F7EC' },
  pending: { label: 'Kutilmoqda', color: '#7A7482', bg: '#F1EFF3' },
  returned: { label: 'Qaytarilgan', color: '#D64545', bg: '#FCEAEA' },
}

export const TARIFF_CONFIG: Record<string, { label: string; days: string; color: string; bg: string }> = {
  express: { label: 'Express', days: '4 kunlik', color: '#E8590C', bg: '#FFF0E6' },
  comfort: { label: 'Comfort', days: '7 kunlik', color: '#0E9488', bg: '#E3F8F6' },
  standart: { label: 'Standart', days: '12 kunlik', color: '#7A7482', bg: '#F1EFF3' },
  premium: { label: 'Premium', days: '4 kunlik', color: '#A07A00', bg: '#FEF6DC' },
}

/**
 * server/src/lib/pipeline.ts dagi TARIFF_COLOR_THRESHOLDS/colorStageFor
 * bilan bir xil — har bir tarif uchun aniq kun bo'linishi (talab #8).
 */
const TARIFF_COLOR_THRESHOLDS: Record<string, { green: number; yellow: number }> = {
  express: { green: 2, yellow: 3 },
  comfort: { green: 3, yellow: 5 },
  premium: { green: 2, yellow: 3 },
  standart: { green: 4, yellow: 8 },
}

export type ColorStage = 'green' | 'yellow' | 'red'

export function colorStageFor(tariff: string | null, addedAt: Date): ColorStage {
  const t = TARIFF_COLOR_THRESHOLDS[tariff ?? 'standart'] ?? TARIFF_COLOR_THRESHOLDS.standart
  const elapsedDays = Math.floor((Date.now() - addedAt.getTime()) / 86_400_000)
  if (elapsedDays < t.green) return 'green'
  if (elapsedDays < t.yellow) return 'yellow'
  return 'red'
}

export const COLOR_STAGE_HEX: Record<ColorStage, string> = {
  green: '#1E9E5A',
  yellow: '#F59E0B',
  red: '#D64545',
}

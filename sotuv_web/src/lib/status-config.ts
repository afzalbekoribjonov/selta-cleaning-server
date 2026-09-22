/**
 * mobile/lib/core/constants.dart dagi kStatusConfig/kTariffConfig bilan
 * 1:1 mos — admin_web/src/lib/status-config.ts bilan bir xil.
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
  express: { label: 'Express', days: '4 kunlik', color: '#CA8A04', bg: '#FEF3C7' },
  comfort: { label: 'Comfort', days: '7 kunlik', color: '#2F80D6', bg: '#E8F1FC' },
  standart: { label: 'Standart', days: '12 kunlik', color: '#8C5AC3', bg: '#F1E9F8' },
  premium: { label: 'Premium', days: '4 kunlik', color: '#DC2626', bg: '#FCEAEA' },
}

export const TARIFF_ORDER = ['express', 'premium', 'comfort', 'standart']

/** Onsite buyurtma pipeline (dispatcher bosqichlarni faqat ko'radi). */
export const SERVICE_PIPELINE: Record<string, string[]> = {
  pickup: ['new', 'picked_up', 'brought_in', 'washing', 'packing', 'qc_review', 'ready', 'done'],
  onsite: ['new', 'team_assigned', 'in_progress', 'done'],
}

import type { TariffConfig } from './tariffs'

export type ColorStage = 'green' | 'yellow' | 'red'

/**
 * Rang bosqichi. Chegaralar ATAYLAB tashqaridan beriladi — ular admin
 * panel orqali o'zgaradigan sozlama (lib/tariffs.ts).
 */
export function colorStageFor(tariff: string | null, addedAt: Date, config: TariffConfig): ColorStage {
  const t = config[tariff ?? 'standart'] ?? config.standart
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

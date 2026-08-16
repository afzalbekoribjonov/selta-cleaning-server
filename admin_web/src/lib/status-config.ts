/**
 * mobile/lib/core/constants.dart dagi kStatusConfig/kTariffConfig bilan
 * 1:1 mos — ikkala tomon ham bir xil kalitlar/ranglar ishlatadi.
 */
export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Yangi', color: '#2F80D6', bg: '#E8F1FC' },
  picked_up: { label: 'Olib ketildi', color: '#0E9488', bg: '#E3F8F6' },
  brought_in: { label: 'Sexga keldi', color: '#7A7482', bg: '#F1EFF3' },
  washing: { label: 'Yuvilmoqda', color: '#2F80D6', bg: '#E8F1FC' },
  packing: { label: 'Upakovka', color: '#8A5A00', bg: '#FBF0DC' },
  qc_review: { label: 'Sifat nazoratida', color: '#F59E0B', bg: '#FFF4E0' },
  ready: { label: 'Tayyor', color: '#1E9E5A', bg: '#E5F7EC' },
  team_assigned: { label: 'Jamoa biriktirildi', color: '#8C5AC3', bg: '#F1E9F8' },
  in_progress: { label: 'Jarayonda', color: '#2F80D6', bg: '#E8F1FC' },
  done: { label: 'Yakunlandi', color: '#1E9E5A', bg: '#E5F7EC' },
}

export const TARIFF_CONFIG: Record<string, { label: string; days: string; color: string; bg: string }> = {
  express: { label: 'Express', days: '4 kunlik', color: '#E8590C', bg: '#FFF0E6' },
  comfort: { label: 'Comfort', days: '7 kunlik', color: '#0E9488', bg: '#E3F8F6' },
  standart: { label: 'Standart', days: '12 kunlik', color: '#7A7482', bg: '#F1EFF3' },
  premium: { label: 'Premium', days: '4 kunlik', color: '#A07A00', bg: '#FEF6DC' },
}

/**
 * Buyurtma "Manba"si (talab: marketing statistikasi) — server/src/lib/
 * orderSources.ts va mobile/lib/core/constants.dart bilan bir xil
 * kalitlar.
 */
export const ORDER_SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: '#C13584' },
  telegram: { label: 'Telegram', color: '#229ED9' },
  referral: { label: 'Tanish orqali', color: '#1E9E5A' },
  car_branding: { label: 'Mashina brandi', color: '#8C5AC3' },
  ad_banner: { label: 'Reklama banneri', color: '#CA8A04' },
}

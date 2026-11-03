/**
 * O'lchov birliklari — kvadrat metr, metr, kilogramm va dona bir-biriga
 * QO'SHILMAYDI, shuning uchun hamma joyda alohida ko'rsatiladi
 * (server/src/lib/orderSummary.ts: UNIT_BY_CALC_TYPE bilan bir xil kalitlar).
 */
export const UNIT_LABELS: Record<string, string> = { sqm: 'm²', meter: 'metr', kg: 'kg', dona: 'dona' }
export const UNIT_ORDER = ['sqm', 'meter', 'kg', 'dona'] as const

export interface UnitAmount {
  unit: string
  label: string
  amount: number
}

/** { sqm: 45.7, dona: 3 } -> tartiblangan ro'yxat (bo'shlari tashlanadi). */
export function unitList(units: Record<string, number> | null | undefined): UnitAmount[] {
  return Object.entries(units ?? {})
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => UNIT_ORDER.indexOf(a as never) - UNIT_ORDER.indexOf(b as never))
    .map(([unit, amount]) => ({ unit, label: UNIT_LABELS[unit] ?? unit, amount }))
}

/** 92.68 -> "92,7"; 3 -> "3" (dona butun, qolganlari 1 xona). */
export function formatQty(amount: number, unit?: string): string {
  const rounded = unit === 'dona' ? Math.round(amount) : Math.round(amount * 10) / 10
  return rounded.toLocaleString('uz-UZ', { maximumFractionDigits: 1 }).replace(/\s/g, ' ')
}

/** 1 363 000 -> "1 363 000 so'm" (bo'sh joy — ajratuvchi). */
export function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/[\s,]/g, ' ')} so'm`
}

/**
 * Grafik o'qlari va tor kartalar uchun: 1 363 000 -> "1,36 mln"; 85 000 -> "85 ming".
 * Son va so'z orasida uzilmaydigan bo'shliq — tor joyda ikki qatorga bo'linmasin.
 */
export function formatMoneyShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('uz-UZ', { maximumFractionDigits: 2 })}\u00a0mlrd`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('uz-UZ', { maximumFractionDigits: 2 })}\u00a0mln`
  if (abs >= 1_000) return `${Math.round(value / 1_000)}\u00a0ming`
  return String(Math.round(value))
}

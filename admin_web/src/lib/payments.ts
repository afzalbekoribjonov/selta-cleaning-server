import { apiPost } from './api'

/**
 * Yetkazishdagi to'lov yozuvlari — server/src/routes/payments.ts
 * javobining aynan shakli.
 *
 * `shortfall` — mahsulotlar narxi bilan mijoz bergan summa orasidagi
 * farq. U qayerga ketgani `kind` bilan belgilanadi.
 */
export type PaymentKind = 'full' | 'partial' | 'debt' | 'discount'

export interface PaymentRow {
  id: string
  orderId: string
  orderNumber: number
  customerName: string
  phone: string
  employeeId: string
  employeeName: string
  dateKey: string
  at: string | null
  itemCount: number
  remainingItemCount: number
  dueAmount: number
  paidAmount: number
  shortfall: number
  kind: PaymentKind
  settled: boolean
  settledAt: string | null
  settledByName: string | null
  settledAmount: number
  note: string | null
}

export interface PaymentTotals {
  debtCount: number
  debtAmount: number
  partialCount: number
  partialAmount: number
  discountCount: number
  discountAmount: number
}

export interface PaymentsResponse {
  scope: 'outstanding' | 'history'
  rows: PaymentRow[]
  totals: PaymentTotals
}

/**
 * `outstanding` — hali yopilmagan qarz va qisman to'lovlar (bir maydonli
 * so'rov, sana chegarasisiz). `history` — sana oralig'i bo'yicha barcha
 * yozuvlar, chegirmalar shu yerdan olinadi.
 */
export function fetchPayments(params: {
  scope: 'outstanding' | 'history'
  from?: string
  to?: string
}): Promise<PaymentsResponse> {
  return apiPost('/listPayments', params)
}

export function settlePayment(paymentId: string, amount?: number) {
  return apiPost('/settlePayment', { paymentId, amount })
}

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  full: "To'liq to'landi",
  partial: "Qisman to'landi",
  debt: 'Qarz',
  discount: 'Chegirma',
}

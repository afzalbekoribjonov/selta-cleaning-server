/** "XX XXX XX XX" ko'rinishida guruhlaydi — mobile/lib/features/dispatcher/new_order_tab.dart:_UzPhoneFormatter bilan bir xil. */
export function formatUzPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9)
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
  return parts.filter(Boolean).join(' ')
}

export function phoneDigits(formatted: string): string {
  return formatted.replace(/\D/g, '')
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^998/, '')
  if (digits.length !== 9) return phone
  return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`
}

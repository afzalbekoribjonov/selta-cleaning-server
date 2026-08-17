const UZ_MONTHS = [
  '', 'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
]

/** 0-indeksli (Date.getMonth() bilan bir xil), bosh harf bilan — banner/sarlavhalar uchun. */
export const UZ_MONTHS_FULL = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

export const UZ_MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

export function formatDateUz(date: Date): string {
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth() + 1]}`
}

export function formatDateTimeUz(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${formatDateUz(date)}, ${h}:${m}`
}

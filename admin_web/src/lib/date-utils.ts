const UZ_MONTHS = [
  '', 'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
]

export function formatDateUz(date: Date): string {
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth() + 1]}`
}

export function formatDateTimeUz(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${formatDateUz(date)}, ${h}:${m}`
}

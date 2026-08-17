import type { DEPARTMENTS } from './departments'

export interface Employee {
  id: string
  fullName: string
  phone: string
  department: keyof typeof DEPARTMENTS
  status: 'active' | 'terminated'
  salary?: { method: string; params: Record<string, number> }
  createdAt: string | null
  terminatedAt: string | null
}

/** "3 yil 2 oy" kabi ish stajini o'qiladigan matnga aylantiradi. */
export function formatTenure(hiredAt: Date, until: Date): string {
  let months = (until.getFullYear() - hiredAt.getFullYear()) * 12 + (until.getMonth() - hiredAt.getMonth())
  if (until.getDate() < hiredAt.getDate()) months -= 1
  months = Math.max(months, 0)
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  const days = Math.max(Math.floor((until.getTime() - hiredAt.getTime()) / 86_400_000), 0)

  if (years === 0 && remMonths === 0) return `${days} kun`
  const parts: string[] = []
  if (years > 0) parts.push(`${years} yil`)
  if (remMonths > 0) parts.push(`${remMonths} oy`)
  return parts.join(' ')
}

/** Bo'lim bo'yicha buyurtmada qaysi maydon shu xodimga tegishli ekanini bildiradi. */
export const DEPARTMENT_ATTRIBUTION_FIELD: Record<string, 'createdBy' | 'washedBy' | 'deliveredBy' | 'qcRatedBy'> = {
  dispatcher: 'createdBy',
  worker: 'washedBy',
  delivery: 'deliveredBy',
  qc: 'qcRatedBy',
}

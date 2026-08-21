export interface Employee {
  id: string
  fullName: string
  phone: string
  // Doimiy 4 ta bo'lim kalitidan biri YOKI "Boshqa" orqali yaratilgan
  // customDepartments/{slug} hujjatining id'si bo'lishi mumkin.
  department: string
  status: 'active' | 'terminated'
  salary?: { method: string; params: Record<string, number> }
  specializations: string[]
  canPack: boolean
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

/**
 * Bo'lim bo'yicha buyurtmada qaysi maydon shu xodimga tegishli ekanini
 * bildiradi. Ishchi/dastavchik uchun endi ARRAY maydon — pickup
 * buyurtmalarida yuvish/yetkazish item-darajasida bo'lgani uchun bir
 * buyurtmada bir nechta turli xodim qatnashishi mumkin (order.ts:
 * changeItemStatus shu massivlarga arrayUnion qiladi).
 */
export const DEPARTMENT_ATTRIBUTION_FIELD: Record<string, { field: string; mode: 'equal' | 'array-contains' }> = {
  dispatcher: { field: 'createdBy', mode: 'equal' },
  worker: { field: 'washedByEmployees', mode: 'array-contains' },
  delivery: { field: 'deliveredByEmployees', mode: 'array-contains' },
}

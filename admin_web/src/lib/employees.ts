import type { DEPARTMENTS } from './departments'

export interface Employee {
  id: string
  fullName: string
  phone: string
  department: keyof typeof DEPARTMENTS
  status: 'active' | 'terminated'
  salary?: { method: string; params: Record<string, number> }
}

/** Bo'lim bo'yicha buyurtmada qaysi maydon shu xodimga tegishli ekanini bildiradi. */
export const DEPARTMENT_ATTRIBUTION_FIELD: Record<string, 'createdBy' | 'washedBy' | 'deliveredBy' | 'qcRatedBy'> = {
  dispatcher: 'createdBy',
  worker: 'washedBy',
  delivery: 'deliveredBy',
  qc: 'qcRatedBy',
}

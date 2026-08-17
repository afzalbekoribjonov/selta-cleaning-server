import { useMemo } from 'react'
import { Briefcase, type LucideIcon } from 'lucide-react'
import { DEPARTMENTS } from '@/lib/departments'
import { useCustomDepartments } from './useCustomDepartments'

export interface DepartmentInfo {
  key: string
  label: string
  icon: LucideIcon
  isCustom: boolean
  includeInStats: boolean
}

/**
 * Doimiy 4 ta bo'lim + "Boshqa" orqali yaratilgan kasblarni bitta ro'yxat/
 * lookup sifatida beradi — bo'lim tanlagichlar, xodimlar guruhlash va
 * profil sahifasida bir xil manbadan foydalanish uchun.
 */
export function useDepartmentLookup() {
  const { departments: custom, loading } = useCustomDepartments()

  const all = useMemo<DepartmentInfo[]>(() => {
    const fixed = Object.entries(DEPARTMENTS).map(([key, d]) => ({
      key,
      label: d.label,
      icon: d.icon,
      isCustom: false,
      includeInStats: true,
    }))
    const customList = custom.map((d) => ({
      key: d.id,
      label: d.label,
      icon: Briefcase,
      isCustom: true,
      includeInStats: d.includeInStats,
    }))
    return [...fixed, ...customList]
  }, [custom])

  const byKey = useMemo(() => {
    const map: Record<string, DepartmentInfo> = {}
    for (const d of all) map[d.key] = d
    return map
  }, [all])

  function getDepartment(key: string): DepartmentInfo {
    return byKey[key] ?? { key, label: key, icon: Briefcase, isCustom: true, includeInStats: false }
  }

  return { all, getDepartment, loading }
}

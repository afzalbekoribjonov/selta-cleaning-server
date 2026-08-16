import { useQuery } from '@tanstack/react-query'
import { apiPost } from '@/lib/api'

interface EmployeeRow {
  id: string
  fullName: string
}

/**
 * employeeId -> fullName xaritasi — audit tarixi/izohlar/statistikada ism
 * ko'rsatish uchun. `['employees']` query kalitini EmployeesPage bilan
 * baham ko'radi, shuning uchun panel bo'ylab bir nechta joyda ishlatilsa
 * ham server'ga faqat bitta so'rov ketadi (keshdan qayta ishlatiladi).
 */
export function useEmployeesMap(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiPost<{ employees: EmployeeRow[] }>('/adminListEmployees'),
    staleTime: 60_000,
  })

  const map: Record<string, string> = {}
  for (const e of data?.employees ?? []) map[e.id] = e.fullName
  return map
}

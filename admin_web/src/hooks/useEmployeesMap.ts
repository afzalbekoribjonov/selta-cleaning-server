import { useEffect, useState } from 'react'
import { apiPost } from '@/lib/api'

interface EmployeeRow {
  id: string
  fullName: string
}

/** employeeId -> fullName xaritasi — audit tarixi/izohlarda ism ko'rsatish uchun. */
export function useEmployeesMap() {
  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    apiPost<{ employees: EmployeeRow[] }>('/adminListEmployees')
      .then((res) => {
        const next: Record<string, string> = {}
        for (const e of res.employees) next[e.id] = e.fullName
        setMap(next)
      })
      .catch(() => {})
  }, [])

  return map
}

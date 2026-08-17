import { useEffect, useState } from 'react'
import { subscribeCustomDepartments, type CustomDepartment } from '@/lib/customDepartments'

export function useCustomDepartments() {
  const [departments, setDepartments] = useState<CustomDepartment[] | null>(null)

  useEffect(() => {
    return subscribeCustomDepartments(setDepartments)
  }, [])

  return { departments: departments ?? [], loading: departments === null }
}

import { useEffect, useState } from 'react'
import { subscribeEmployeeAdvances, type Advance } from '@/lib/advances'

export function useEmployeeAdvances(employeeId: string) {
  const [advances, setAdvances] = useState<Advance[] | null>(null)

  useEffect(() => {
    setAdvances(null)
    if (!employeeId) return
    return subscribeEmployeeAdvances(employeeId, setAdvances)
  }, [employeeId])

  return { advances: advances ?? [], loading: advances === null }
}

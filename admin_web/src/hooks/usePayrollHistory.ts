import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface PayrollRun {
  yearMonth: string // doc id, "2026-03"
  amount: number
  method: string
  orderCount?: number
}

/** `employees/{id}/payrollRuns` — admin "Hisoblash" bosgan oylar tarixi. */
export function usePayrollHistory(employeeId: string) {
  const [runs, setRuns] = useState<PayrollRun[] | null>(null)

  useEffect(() => {
    setRuns(null)
    const q = query(collection(db, 'employees', employeeId, 'payrollRuns'), orderBy('__name__'))
    return onSnapshot(q, (snap) => {
      setRuns(
        snap.docs.map((d) => {
          const data = d.data()
          const breakdown = (data.breakdown ?? {}) as Record<string, unknown>
          return {
            yearMonth: d.id,
            amount: data.amount ?? 0,
            method: data.method ?? '',
            orderCount: typeof breakdown.orderCount === 'number' ? breakdown.orderCount : undefined,
          }
        }),
      )
    })
  }, [employeeId])

  return { runs, loading: runs === null }
}

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface DepartmentChangeEvent {
  id: string
  fromDepartment: string
  toDepartment: string
  changedBy: string
  changedAt: Date
}

/** `employees/{id}/departmentHistory` — kasb o'zgarishlari audit tarixi. */
export function useDepartmentHistory(employeeId: string) {
  const [events, setEvents] = useState<DepartmentChangeEvent[] | null>(null)

  useEffect(() => {
    setEvents(null)
    if (!employeeId) return
    const q = query(collection(db, 'employees', employeeId, 'departmentHistory'), orderBy('changedAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setEvents(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            fromDepartment: data.fromDepartment ?? '',
            toDepartment: data.toDepartment ?? '',
            changedBy: data.changedBy ?? '',
            changedAt: (data.changedAt as Timestamp | undefined)?.toDate() ?? new Date(),
          }
        }),
      )
    })
  }, [employeeId])

  return { events: events ?? [], loading: events === null }
}

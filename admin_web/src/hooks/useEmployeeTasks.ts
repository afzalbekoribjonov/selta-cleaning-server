import { useEffect, useState } from 'react'
import { subscribeEmployeeTasks, type Task } from '@/lib/tasks'

export function useEmployeeTasks(employeeId: string) {
  const [tasks, setTasks] = useState<Task[] | null>(null)

  useEffect(() => {
    setTasks(null)
    if (!employeeId) return
    return subscribeEmployeeTasks(employeeId, setTasks)
  }, [employeeId])

  return { tasks: tasks ?? [], loading: tasks === null }
}

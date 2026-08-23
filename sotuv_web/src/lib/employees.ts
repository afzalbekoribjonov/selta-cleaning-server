import { apiPost } from './api'

export interface EmployeeSummaryFull {
  id: string
  fullName: string
  departmentLabel?: string
}

export async function listEmployeesByDepartment(department: string): Promise<EmployeeSummaryFull[]> {
  const result = await apiPost<{ employees: EmployeeSummaryFull[] }>('/listEmployeesByDepartment', { department })
  return result.employees
}

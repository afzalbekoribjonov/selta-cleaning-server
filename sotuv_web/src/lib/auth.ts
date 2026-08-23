import { signInWithCustomToken, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { apiPost } from './api'

export interface EmployeeSummary {
  id: string
  fullName: string
}

/** server/src/routes/auth.ts:listEmployeesByDepartment — ochiq, autentifikatsiyasiz. */
export async function listDispatchers(): Promise<EmployeeSummary[]> {
  const result = await apiPost<{ employees: EmployeeSummary[] }>('/listEmployeesByDepartment', {
    department: 'dispatcher',
  })
  return result.employees
}

/** PIN'ni serverda tekshiradi, muvaffaqiyatli bo'lsa custom token bilan kiradi. */
export async function loginWithPin(employeeId: string, pin: string): Promise<void> {
  const result = await apiPost<{ token: string }>('/loginWithPin', { employeeId, pin })
  await signInWithCustomToken(auth, result.token)
}

export async function logout(): Promise<void> {
  await signOut(auth)
}

export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}

export interface EmployeeClaims {
  employeeId: string
  role: string
  department: string
}

export async function getEmployeeClaims(user: User): Promise<EmployeeClaims | null> {
  const tokenResult = await user.getIdTokenResult(true)
  const claims = tokenResult.claims
  if (!claims.employeeId) return null
  return {
    employeeId: claims.employeeId as string,
    role: claims.role as string,
    department: claims.department as string,
  }
}

export interface EmployeeProfile {
  fullName: string
  department: string
  attendanceEnabled?: boolean
}

export async function fetchEmployeeProfile(employeeId: string): Promise<EmployeeProfile | null> {
  const snap = await getDoc(doc(db, 'employees', employeeId))
  if (!snap.exists()) return null
  return snap.data() as EmployeeProfile
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  subscribeAuthState,
  getEmployeeClaims,
  fetchEmployeeProfile,
  logout as doLogout,
  type EmployeeClaims,
  type EmployeeProfile,
} from './auth'

interface AuthContextValue {
  user: User | null
  claims: EmployeeClaims | null
  profile: EmployeeProfile | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<EmployeeClaims | null>(null)
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeAuthState(async (u) => {
      setUser(u)
      if (!u) {
        setClaims(null)
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const c = await getEmployeeClaims(u)
        setClaims(c)
        if (c) {
          const p = await fetchEmployeeProfile(c.employeeId)
          setProfile(p)
        }
      } catch {
        setClaims(null)
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  const value: AuthContextValue = {
    user,
    claims,
    profile,
    loading,
    logout: doLogout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

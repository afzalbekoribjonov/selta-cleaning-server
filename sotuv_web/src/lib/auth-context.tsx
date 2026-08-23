import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { subscribeAuthState, getEmployeeClaims, fetchEmployeeProfile, logout as doLogout, type EmployeeClaims } from './auth'

interface AuthContextValue {
  user: User | null
  claims: EmployeeClaims | null
  fullName: string | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<EmployeeClaims | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeAuthState(async (u) => {
      setUser(u)
      if (!u) {
        setClaims(null)
        setFullName(null)
        setLoading(false)
        return
      }
      // Vaqtinchalik tarmoq xatosi (token yangilashda) butun ilovani
      // "Yuklanmoqda" holatida abadiy ushlab qolmasligi kerak — bir marta
      // qayta urinib ko'riladi, baribir muvaffaqiyatsiz bo'lsa xodim qayta
      // PIN kiritishi kerak bo'ladi (loading yopiladi, claims null qoladi).
      try {
        const c = await getEmployeeClaims(u)
        setClaims(c)
        if (c) {
          const profile = await fetchEmployeeProfile(c.employeeId)
          setFullName(profile?.fullName ?? null)
        }
      } catch {
        setClaims(null)
        setFullName(null)
      }
      setLoading(false)
    })
  }, [])

  const value: AuthContextValue = {
    user,
    claims,
    fullName,
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

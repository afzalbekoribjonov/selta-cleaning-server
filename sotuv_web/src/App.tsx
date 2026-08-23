import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { AppShell } from '@/components/AppShell'
import { FullPageSpinner } from '@/components/Spinner'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const ActiveOrdersPage = lazy(() => import('@/pages/ActiveOrdersPage'))
const NewOrderPage = lazy(() => import('@/pages/NewOrderPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, claims, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user || !claims) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppShell>
                <Suspense fallback={<FullPageSpinner />}>
                  <Routes>
                    <Route index element={<ActiveOrdersPage />} />
                    <Route path="yangi" element={<NewOrderPage />} />
                    <Route path="qidiruv" element={<SearchPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppShell>
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
  )
}

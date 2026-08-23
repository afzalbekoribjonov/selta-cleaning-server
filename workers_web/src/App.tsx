import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { FullPageSpinner } from '@/components/Spinner'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const WorkerHomePage = lazy(() => import('@/pages/WorkerHomePage'))

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
              <WorkerHomePage />
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
  )
}

import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { FullPageSpinner } from '@/components/SeltaLoader'
import { AppShell } from '@/components/AppShell'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const WorkerHomePage = lazy(() => import('@/pages/WorkerHomePage'))
const TeamJobsPage = lazy(() => import('@/pages/TeamJobsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const StatsPage = lazy(() => import('@/pages/StatsPage'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, claims, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user || !claims) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Vakolat talab qiladigan sahifa — vakolat yo'q bo'lsa bosh sahifaga qaytaradi. */
function RequireStats({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!profile?.canViewStats) return <Navigate to="/" replace />
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
                    <Route index element={<WorkerHomePage />} />
                    <Route path="jamoa" element={<TeamJobsPage />} />
                    <Route path="profil" element={<ProfilePage />} />
                    <Route
                      path="statistika"
                      element={
                        <RequireStats>
                          <StatsPage />
                        </RequireStats>
                      }
                    />
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

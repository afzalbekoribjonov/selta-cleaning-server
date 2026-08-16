import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth-context'
import { FullPageSpinner } from '@/components/ui/Spinner'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const OrdersPage = lazy(() => import('@/pages/OrdersPage'))
const EmployeesPage = lazy(() => import('@/pages/EmployeesPage'))
const PayrollPage = lazy(() => import('@/pages/PayrollPage'))
const ProductsPage = lazy(() => import('@/pages/ProductsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <FullPageSpinner />
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
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
                    <Route index element={<DashboardPage />} />
                    <Route path="orders" element={<OrdersPage />} />
                    <Route path="employees" element={<EmployeesPage />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="products" element={<ProductsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
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

import { type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ClipboardList, Home, User, BarChart3 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMyTeamOrders } from '@/hooks/useMyTeamOrders'
import { Link } from 'react-router-dom'
import { AttendanceGate } from '@/components/AttendanceGate'

const NAV_ITEMS = [
  { to: '/', label: 'Ishlar', icon: ClipboardList, end: true },
  { to: '/jamoa', label: 'Joyida yuvish', icon: Home, end: false },
  { to: '/profil', label: 'Profil', icon: User, end: false },
]

const TITLES: Record<string, string> = {
  '/': 'Ishlar',
  '/jamoa': 'Joyida yuvish',
  '/profil': 'Profil',
  '/statistika': "Kunlik ko'rsatkichlar",
}

/**
 * Mobil-birinchi qobiq — ilovadagi kabi pastki navigatsiya bilan.
 * iPhone'ning yuqori (notch) va pastki (home indicator) xavfsiz
 * zonalari hisobga olingan, shuning uchun "Asosiy ekranga qo'shish"
 * orqali ochilganda ham hech narsa kesilib qolmaydi.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const location = useLocation()
  const teamOrders = useMyTeamOrders()
  const canViewStats = profile?.canViewStats ?? false
  const title = TITLES[location.pathname] ?? 'Selta Cleaning'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="/brand/icon_purple.png" alt="Selta Cleaning" className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[15px] font-extrabold leading-tight text-ink">{title}</p>
            <p className="truncate text-xs font-semibold text-brand-primary">{profile?.fullName ?? '...'}</p>
          </div>
          {canViewStats && (
            <Link
              to="/statistika"
              aria-label="Kunlik ko'rsatkichlar"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary active:scale-95"
            >
              <BarChart3 size={19} />
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 pb-24">
        <AttendanceGate />
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/97 pb-safe backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          {NAV_ITEMS.map((item) => {
            const badge = item.to === '/jamoa' ? teamOrders.length : 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${
                    isActive ? 'text-brand-primary' : 'text-gray-dark'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <item.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                      {badge > 0 && (
                        <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-danger px-1 text-[9px] font-extrabold leading-4 text-white">
                          {badge}
                        </span>
                      )}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

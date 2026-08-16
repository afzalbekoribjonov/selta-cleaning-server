import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Wallet,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'

const NAV_ITEMS = [
  { to: '/', label: 'Boshqaruv paneli', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Buyurtmalar', icon: ClipboardList },
  { to: '/employees', label: 'Xodimlar', icon: Users },
  { to: '/payroll', label: 'Maosh va statistika', icon: Wallet },
  { to: '/settings', label: 'Sozlamalar', icon: Settings },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:flex-col border-r border-border bg-surface">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl flex flex-col">
            <div className="flex justify-end p-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg hover:bg-bg"
                aria-label="Yopish"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/90 backdrop-blur px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-bg"
            aria-label="Menyu"
          >
            <Menu size={22} />
          </button>
          <img src="/brand/icon_purple.png" alt="Selta Cleaning" className="h-7 w-7" />
          <span className="font-heading font-extrabold text-ink">Selta Cleaning</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()

  return (
    <>
      <div className="flex items-center gap-2 px-6 py-6">
        <img src="/brand/lockup_purple.png" alt="Selta Cleaning" className="h-8" />
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-ink/70 hover:bg-bg hover:text-ink',
              )
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border px-3 py-4">
        {user && <div className="truncate px-3 pb-2 text-xs text-gray-dark">{user.email}</div>}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-bg hover:text-danger"
        >
          <LogOut size={19} />
          Chiqish
        </button>
      </div>
      <div className="px-6 pb-5 text-xs text-gray">© 2026 Selta Cleaning</div>
    </>
  )
}

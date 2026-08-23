import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ListChecks, PlusCircle, Search, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const NAV_ITEMS = [
  { to: '/', label: 'Faol buyurtmalar', icon: ListChecks, end: true },
  { to: '/yangi', label: 'Yangi buyurtma', icon: PlusCircle, end: false },
  { to: '/qidiruv', label: 'Qidiruv', icon: Search, end: false },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { fullName, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-lg font-extrabold text-white">
            S
          </div>
          <div className="min-w-0">
            <p className="font-heading text-sm font-extrabold text-ink">Selta Cleaning</p>
            <p className="truncate text-xs font-bold text-brand-primary">{fullName ?? '...'}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${
                  isActive ? 'bg-brand-primary text-white' : 'text-ink/70 hover:bg-bg hover:text-ink'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-extrabold text-brand-primary">
              {(fullName ?? '?').charAt(0).toUpperCase()}
            </div>
            <p className="truncate text-xs font-bold text-gray-dark">Sotuv menejeri</p>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-dark hover:bg-danger-bg hover:text-danger"
          >
            <LogOut size={16} />
            Chiqish
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

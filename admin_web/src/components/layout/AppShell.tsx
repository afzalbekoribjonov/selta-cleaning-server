import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Wallet,
  CalendarRange,
  Receipt,
  Package,
  Megaphone,
  CalendarCheck,
  HandCoins,
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
  { to: '/monthly-report', label: 'Oylik hisobot', icon: CalendarRange },
  { to: '/expenses', label: 'Chiqimlar', icon: Receipt },
  { to: '/products', label: 'Mahsulotlar', icon: Package },
  { to: '/marketing', label: 'Marketing statistikasi', icon: Megaphone },
  { to: '/finance', label: 'Qarz va chegirmalar', icon: HandCoins },
  { to: '/attendance', label: 'Davomat nazorati', icon: CalendarCheck },
  { to: '/settings', label: 'Sozlamalar', icon: Settings },
]

/** Joriy bo'lim nomi — telefon sarlavhasida (ilova ichida ham qaysi sahifadaligi ko'rinsin). */
function currentTitle(pathname: string): string {
  const item = NAV_ITEMS.find((i) => matchPath({ path: i.to, end: i.end ?? false }, pathname))
  return item?.label ?? 'Selta Cleaning'
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const title = currentTitle(location.pathname)

  // Sahifa almashganda yangi sahifa tepadan boshlansin (SPA buni o'zi qilmaydi).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Menyu ochiq turganda orqadagi sahifa aylanmasin; Escape bilan yopiladi.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  return (
    <div className="min-h-[100dvh] bg-bg">
      {/* Kompyuter: doimiy yon panel */}
      <aside className="hidden border-r border-border bg-surface lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Telefon/planshet: chapdan chiquvchi menyu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
          <div className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] animate-[slide-in_200ms_ease-out] flex-col bg-surface pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex items-center justify-between py-2 pl-6 pr-3">
              <img src="/brand/lockup_purple.png" alt="Selta Cleaning" className="h-7" />
              <button onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-bg" aria-label="Yopish">
                <X size={20} />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} compact />
          </aside>
        </div>
      )}

      <div className="flex min-h-[100dvh] flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <div className="flex items-center gap-2 px-2 py-1.5 sm:px-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-bg"
              aria-label="Menyu"
            >
              <Menu size={22} />
            </button>
            <img src="/brand/icon_purple.png" alt="" className="h-7 w-7 shrink-0" />
            <span className="min-w-0 truncate font-heading text-[15px] font-extrabold text-ink" title={title}>
              {title}
            </span>
          </div>
        </header>

        {/* `overflow-x-clip` — xavfsizlik to'ri: biror ichki element
            kutilmaganda kengayib ketsa, butun sahifa gorizontal siljimasin.
            `hidden` emas, `clip`: u aylantirish konteyneri yaratmaydi,
            shuning uchun `sticky` sarlavhalar ishlayveradi. Haqiqiy keng
            mazmun (jadvallar) o'z `overflow-x-auto` idishida qoladi. */}
        <main className="min-w-0 flex-1 overflow-x-clip p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { user, logout } = useAuth()

  return (
    <>
      {!compact && (
        <div className="flex items-center gap-2 px-6 py-6">
          <img src="/brand/lockup_purple.png" alt="Selta Cleaning" className="h-8" />
        </div>
      )}
      {/* Past ekranda (gorizontal telefon, kichik noutbuk) bandlar
          kesilib qolmasin — ro'yxat o'zi aylanadi. */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-brand-primary text-white shadow-sm' : 'text-ink/70 hover:bg-bg hover:text-ink',
              )
            }
          >
            <Icon size={19} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border px-3 py-3">
        {user && <div className="truncate px-3 pb-2 text-xs text-gray-dark">{user.email}</div>}
        <button
          onClick={logout}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-bg hover:text-danger"
        >
          <LogOut size={19} />
          Chiqish
        </button>
      </div>
      {!compact && <div className="px-6 pb-5 text-xs text-gray">© 2026 Selta Cleaning</div>}
    </>
  )
}

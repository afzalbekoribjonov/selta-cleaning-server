import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LogOut,
  BarChart3,
  ShieldCheck,
  Package,
  Home,
  MapPin,
  ChevronRight,
  Smartphone,
  Share,
  PlusSquare,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PRODUCT_CATEGORY_LABELS } from '@/lib/products'

const DEPARTMENT_LABELS: Record<string, string> = {
  worker: 'Ishchi',
  delivery: 'Dastavchik',
  dispatcher: 'Sotuv menejeri',
}

/** iOS Safari'da standalone (asosiy ekrandan ochilgan) rejimdami. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function ProfilePage() {
  const { profile, claims, logout } = useAuth()
  const [logoutOpen, setLogoutOpen] = useState(false)

  const specializations = profile?.specializations ?? []
  const showInstallHint = isIos() && !isStandalone()

  return (
    <div className="px-4 py-4">
      <div className="animate-fade-up rounded-3xl bg-gradient-to-br from-brand-primary to-brand-primary-dark p-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-2xl font-extrabold text-white">
          {(profile?.fullName ?? '?').charAt(0).toUpperCase()}
        </div>
        <p className="mt-3 font-heading text-lg font-extrabold text-white">{profile?.fullName ?? '...'}</p>
        <p className="mt-0.5 text-xs font-semibold text-white/70">
          {DEPARTMENT_LABELS[profile?.department ?? ''] ?? profile?.department ?? ''}
        </p>
      </div>

      {profile?.canViewStats && (
        <Link
          to="/statistika"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <BarChart3 size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-ink">Kunlik ko'rsatkichlar</p>
            <p className="text-xs text-gray-dark">Bugungi sex, yuvish va yetkazish holati</p>
          </div>
          <ChevronRight size={18} className="text-gray" />
        </Link>
      )}

      <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-extrabold text-ink">Vakolatlar</h2>
        <div className="space-y-2.5">
          <PermissionRow
            icon={Package}
            label="Upakovka qilish"
            granted={profile?.canPack ?? false}
            hint="Yuvilgan mahsulotni tasdiqlash yoki qaytarish"
          />
          <PermissionRow
            icon={Home}
            label="Joyida yuvish jamoasi"
            granted={profile?.canDoOnsiteWashing ?? false}
            hint="Mijoz manzilida ishlash uchun biriktirilish"
          />
          <PermissionRow
            icon={MapPin}
            label="Davomat nazorati"
            granted={profile?.attendanceEnabled ?? false}
            hint="Ishga kelish GPS orqali belgilanadi"
          />
          <PermissionRow
            icon={BarChart3}
            label="Kunlik ko'rsatkichlar"
            granted={profile?.canViewStats ?? false}
            hint="Bugungi statistikani ko'rish"
          />
        </div>
      </section>

      {profile?.department === 'worker' && (
        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-extrabold text-ink">Mutaxassislik</h2>
          <p className="mb-3 text-xs text-gray-dark">Qaysi turdagi mahsulotlar bilan ishlashingiz mumkin</p>
          {specializations.length === 0 ? (
            <p className="rounded-xl bg-warning-bg px-3 py-2.5 text-xs font-bold text-warning">
              Hali mutaxassislik belgilanmagan — admin bilan bog'laning
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {specializations.map((s) => (
                <span key={s} className="rounded-full bg-brand-primary/10 px-3 py-1.5 text-xs font-bold text-brand-primary">
                  {PRODUCT_CATEGORY_LABELS[s] ?? s}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {showInstallHint && (
        <section className="mt-4 rounded-2xl border border-brand-accent/40 bg-brand-accent/10 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Smartphone size={17} className="text-ink" />
            <h2 className="text-sm font-extrabold text-ink">Asosiy ekranga qo'shish</h2>
          </div>
          <p className="text-xs leading-relaxed text-ink/80">
            Ilova kabi tez ochilishi uchun: pastdagi <Share size={13} className="inline align-text-bottom" />{' '}
            <strong>Ulashish</strong> tugmasini bosing, so'ng{' '}
            <PlusSquare size={13} className="inline align-text-bottom" />{' '}
            <strong>"Asosiy ekranga qo'shish"</strong>ni tanlang.
          </p>
        </section>
      )}

      <button
        onClick={() => setLogoutOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/30 bg-danger-bg py-3.5 text-sm font-extrabold text-danger active:scale-[0.99]"
      >
        <LogOut size={17} />
        Chiqish
      </button>

      <p className="mt-6 text-center text-[11px] text-gray">Selta Cleaning · {claims?.department ?? ''}</p>

      <ConfirmDialog
        open={logoutOpen}
        danger
        title="Hisobdan chiqish"
        message="Chiqqaningizdan so'ng qayta kirish uchun PIN kodingiz kerak bo'ladi."
        confirmLabel="Chiqish"
        onConfirm={logout}
        onClose={() => setLogoutOpen(false)}
      />
    </div>
  )
}

function PermissionRow({
  icon: Icon,
  label,
  granted,
  hint,
}: {
  icon: typeof Package
  label: string
  granted: boolean
  hint: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          granted ? 'bg-success-bg text-success' : 'bg-bg text-gray'
        }`}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-bold ${granted ? 'text-ink' : 'text-gray-dark'}`}>{label}</p>
          {granted && <ShieldCheck size={13} className="text-success" />}
        </div>
        <p className="text-[11px] leading-snug text-gray-dark">{granted ? hint : 'Vakolat berilmagan'}</p>
      </div>
    </div>
  )
}

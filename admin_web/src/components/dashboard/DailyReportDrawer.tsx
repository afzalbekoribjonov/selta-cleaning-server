import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Search, Package, Layers } from 'lucide-react'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchDailyIntakeItems,
  formatAmount,
  formatMoney,
  formatTime,
  formatUnitTotals,
  type ActivityRow,
  type IntakeOrderRow,
  type UnitTotal,
} from '@/lib/daily-report'
import { TARIFF_CONFIG, STATUS_CONFIG } from '@/lib/status-config'

export type DrawerKind = 'intake' | 'washed' | 'packed' | 'delivered'

const KIND_TITLES: Record<DrawerKind, { title: string; subtitle: string }> = {
  intake: { title: 'Sexga kelgan buyurtmalar', subtitle: 'Shu kuni sexga qabul qilingan buyurtmalar va ularning mahsulotlari' },
  washed: { title: 'Yuvilgan mahsulotlar', subtitle: 'Shu kuni "Yuvilmoqda" bosqichidan upakovkaga o\'tgan mahsulotlar' },
  packed: { title: 'Upakovka qilingan mahsulotlar', subtitle: 'Shu kuni upakovka qilinib, yetkazishga tayyor bo\'lgan mahsulotlar' },
  delivered: { title: 'Yetkazilgan mahsulotlar', subtitle: 'Shu kuni mijozga topshirilgan mahsulotlar va olingan summa' },
}

/**
 * "Ko'rish" tugmasi ochadigan to'liq ro'yxat — qidiruv va xodim/birlik
 * filtri bilan. Katta ekranda o'ng tomondan chiqadigan panel, telefonda
 * butun ekranni egallaydi (talab: mobil ko'rinish ham sifatli bo'lsin).
 *
 * Ma'lumot allaqachon kunlik hisobot bilan birga kelgan — bu yerda
 * qo'shimcha so'rov faqat "Sexga keldi" bo'limining mahsulot ko'rinishi
 * uchun (u ataylab dangasa yuklanadi).
 */
export function DailyReportDrawer({
  kind,
  date,
  rows,
  intakeOrders,
  totals,
  onClose,
}: {
  kind: DrawerKind
  date: string
  rows: ActivityRow[]
  intakeOrders: IntakeOrderRow[]
  totals: UnitTotal[]
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null)
  const [intakeView, setIntakeView] = useState<'orders' | 'items'>('orders')

  const intakeItems = useQuery({
    queryKey: ['dailyIntakeItems', date],
    queryFn: () => fetchDailyIntakeItems(date),
    enabled: kind === 'intake' && intakeView === 'items',
    staleTime: 60_000,
  })

  const employees = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.employeeId, r.employeeName)
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const needle = search.trim().toLowerCase()
  const matches = (...fields: (string | number | null | undefined)[]) =>
    !needle || fields.some((f) => f != null && String(f).toLowerCase().includes(needle))

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!employeeFilter || r.employeeId === employeeFilter) &&
          matches(r.orderNumber, r.customerName, r.phone, r.itemName, r.itemId, r.orderId, r.employeeName),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, employeeFilter, needle],
  )

  const filteredIntakeOrders = useMemo(
    () => intakeOrders.filter((o) => matches(o.orderNumber, o.customerName, o.phone, o.orderId, o.location)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intakeOrders, needle],
  )

  const filteredIntakeItems = useMemo(
    () =>
      (intakeItems.data?.rows ?? []).filter((r) =>
        matches(r.orderNumber, r.customerName, r.phone, r.itemName, r.itemId, r.orderId),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intakeItems.data, needle],
  )

  const { title, subtitle } = KIND_TITLES[kind]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-2xl sm:max-w-4xl">
        <header className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-extrabold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-dark">{subtitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-bg px-2.5 py-1 text-xs font-bold text-ink">{date}</span>
              <span className="rounded-lg bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                {formatUnitTotals(totals)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-dark hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buyurtma №, mijoz, telefon, mahsulot yoki ID"
              className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
            />
          </div>

          {kind === 'intake' && (
            <div className="flex rounded-xl border border-border bg-bg p-1">
              {(
                [
                  { id: 'orders', label: 'Buyurtmalar', icon: Layers },
                  { id: 'items', label: 'Mahsulotlar', icon: Package },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setIntakeView(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    intakeView === id ? 'bg-brand-primary text-white' : 'text-ink/70'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {employees.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <FilterChip active={employeeFilter === null} onClick={() => setEmployeeFilter(null)}>
                Hammasi
              </FilterChip>
              {employees.map((e) => (
                <FilterChip key={e.id} active={employeeFilter === e.id} onClick={() => setEmployeeFilter(e.id)}>
                  {e.name}
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {kind === 'intake' ? (
            intakeView === 'orders' ? (
              <IntakeOrdersList orders={filteredIntakeOrders} />
            ) : intakeItems.isLoading ? (
              <Spinner className="py-10" />
            ) : intakeItems.isError ? (
              <EmptyState text="Mahsulotlarni yuklab bo'lmadi" />
            ) : (
              <IntakeItemsList rows={filteredIntakeItems} />
            )
          ) : (
            <ActivityList rows={filteredRows} kind={kind} />
          )}
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? 'bg-brand-primary text-white' : 'border border-border bg-bg text-ink/70 hover:border-brand-primary/40'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm text-gray-dark">{text}</p>
}

/** Buyurtma/mahsulot ID — nusxa olish uchun to'liq, lekin ko'zni charchatmaydigan. */
function IdChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      title={value}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 font-mono text-[10px] text-gray-dark"
    >
      <span className="font-sans font-bold">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  )
}

function ActivityList({ rows, kind }: { rows: ActivityRow[]; kind: DrawerKind }) {
  if (rows.length === 0) return <EmptyState text="Bu kunda yozuv yo'q" />

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id} className="rounded-2xl border border-border bg-bg/40 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-sm font-extrabold text-ink">#{r.orderNumber}</span>
                {r.itemNumber != null && (
                  <span className="rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-brand-primary">
                    {r.itemNumber}-mahsulot
                  </span>
                )}
                <span className="truncate text-sm font-semibold text-ink">{r.itemName}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-dark">
                {r.customerName || "Noma'lum"} · {r.phone}
              </p>
            </div>
            <div className="text-right">
              <div className="font-heading text-sm font-extrabold text-ink">
                {formatAmount(r.unitAmount)} {r.unitLabel}
              </div>
              <div className="text-xs font-semibold text-gray-dark">{formatMoney(r.collectedAmount ?? r.price)}</div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-[11px] text-gray-dark">
            <span className="font-bold text-ink">{formatTime(r.at)}</span>
            <span>
              {kind === 'delivered' ? 'Yetkazdi' : kind === 'packed' ? 'Upakovka qildi' : 'Yuvdi'}:{' '}
              <strong className="text-ink">{r.employeeName}</strong>
            </span>
            {kind === 'delivered' && r.collectedAmount != null && r.collectedAmount !== r.price && (
              <span className="rounded-md bg-warning-bg px-1.5 py-0.5 font-bold text-warning">
                Narxi {formatMoney(r.price)}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <IdChip label="Buyurtma" value={r.orderId} />
            {r.itemId && <IdChip label="Mahsulot" value={r.itemId} />}
          </div>
        </li>
      ))}
    </ul>
  )
}

function IntakeOrdersList({ orders }: { orders: IntakeOrderRow[] }) {
  if (orders.length === 0) return <EmptyState text="Bu kunda sexga buyurtma kelmagan" />

  return (
    <ul className="space-y-2.5">
      {orders.map((o) => (
        <li key={o.orderId} className="rounded-2xl border border-border bg-bg/40 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-sm font-extrabold text-ink">#{o.orderNumber}</span>
                {o.intakeMethod === 'walk_in' && (
                  <span className="rounded-md bg-info-bg px-1.5 py-0.5 text-[11px] font-bold text-info">O'zi keldi</span>
                )}
                {o.unmeasuredCount > 0 && (
                  <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-[11px] font-bold text-danger">
                    {o.unmeasuredCount} ta o'lchanmagan
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold text-ink">{o.customerName || "Noma'lum"}</p>
              <p className="truncate text-xs text-gray-dark">
                {o.phone}
                {o.location ? ` · ${o.location}` : ''}
              </p>
            </div>
            <div className="text-right">
              <div className="font-heading text-sm font-extrabold text-ink">{formatUnitTotals(o.totals)}</div>
              <div className="text-xs font-semibold text-gray-dark">{formatMoney(o.totalPrice)}</div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-[11px] text-gray-dark">
            <span className="font-bold text-ink">{formatTime(o.at)}</span>
            <span>
              {o.itemCount} ta mahsulot
            </span>
            {o.broughtInByName && (
              <span>
                Olib keldi: <strong className="text-ink">{o.broughtInByName}</strong>
              </span>
            )}
          </div>
          <div className="mt-1.5">
            <IdChip label="Buyurtma" value={o.orderId} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function IntakeItemsList({ rows }: { rows: Awaited<ReturnType<typeof fetchDailyIntakeItems>>['rows'] }) {
  if (rows.length === 0) return <EmptyState text="Bu kunda mahsulot topilmadi" />

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const tariff = r.tariff ? TARIFF_CONFIG[r.tariff as keyof typeof TARIFF_CONFIG] : null
        const status = r.status ? STATUS_CONFIG[r.status] : null
        return (
          <li key={r.itemId} className="rounded-2xl border border-border bg-bg/40 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-sm font-extrabold text-ink">#{r.orderNumber}</span>
                  {r.itemNumber != null && (
                    <span className="rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-brand-primary">
                      {r.itemNumber}-mahsulot
                    </span>
                  )}
                  <span className="truncate text-sm font-semibold text-ink">{r.itemName}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-dark">
                  {r.customerName || "Noma'lum"} · {r.phone}
                </p>
              </div>
              <div className="text-right">
                <div className="font-heading text-sm font-extrabold text-ink">
                  {r.unitAmount > 0 ? `${formatAmount(r.unitAmount)} ${r.unitLabel}` : "O'lchanmagan"}
                </div>
                <div className={`text-xs font-semibold ${r.price > 0 ? 'text-gray-dark' : 'text-danger'}`}>
                  {formatMoney(r.price)}
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-[11px] text-gray-dark">
              {r.width && r.height && (
                <span>
                  {r.width} × {r.height} m
                </span>
              )}
              {tariff && <span className="font-bold text-ink">{tariff.label}</span>}
              {status && <span>{status.label}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <IdChip label="Buyurtma" value={r.orderId} />
              <IdChip label="Mahsulot" value={r.itemId} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

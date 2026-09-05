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
  type ActivityRow,
  type IntakeItemRow,
  type IntakeOrderRow,
  type UnitTotal,
} from '@/lib/daily-report'
import { TARIFF_CONFIG, STATUS_CONFIG } from '@/lib/status-config'
import { ReportTable, type ReportColumn } from './ReportTable'
import { UnitTotals } from './UnitTotals'

export type DrawerKind = 'intake' | 'washed' | 'packed' | 'delivered'

const KIND_TITLES: Record<DrawerKind, { title: string; subtitle: string }> = {
  intake: { title: 'Sexga kelgan buyurtmalar', subtitle: 'Shu kuni sexga qabul qilingan buyurtmalar va ularning mahsulotlari' },
  washed: { title: 'Yuvilgan mahsulotlar', subtitle: "Shu kuni yuvib bo'linib, upakovkaga o'tgan mahsulotlar" },
  packed: { title: 'Upakovka qilingan mahsulotlar', subtitle: "Shu kuni upakovka qilinib, yetkazishga tayyor bo'lgan mahsulotlar" },
  delivered: { title: 'Yetkazilgan mahsulotlar', subtitle: 'Shu kuni mijozga topshirilgan mahsulotlar va olingan summa' },
}

const ACTOR_LABEL: Record<DrawerKind, string> = {
  intake: 'Olib keldi',
  washed: 'Yuvdi',
  packed: 'Upakovka qildi',
  delivered: 'Yetkazdi',
}

/** Buyurtma raqami — hamma joyda bir xil ko'rinishda. */
function OrderNo({ value }: { value: number }) {
  return <span className="font-heading font-extrabold text-ink">#{value}</span>
}

/**
 * "Ko'rish" tugmasi ochadigan to'liq ro'yxat — qidiruv va xodim filtri
 * bilan. Katta ekranda o'ng tomondan chiqadigan panel, telefonda butun
 * ekranni egallaydi.
 *
 * Ma'lumot allaqachon kunlik hisobot bilan birga kelgan — qo'shimcha
 * so'rov faqat "Sexga keldi" bo'limining mahsulot ko'rinishi uchun (u
 * ataylab dangasa yuklanadi).
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
          matches(r.orderNumber, r.customerName, r.phone, r.itemName, r.employeeName),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, employeeFilter, needle],
  )

  const filteredIntakeOrders = useMemo(
    () => intakeOrders.filter((o) => matches(o.orderNumber, o.customerName, o.phone, o.location)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intakeOrders, needle],
  )

  const filteredIntakeItems = useMemo(
    () => (intakeItems.data?.rows ?? []).filter((r) => matches(r.orderNumber, r.customerName, r.phone, r.itemName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intakeItems.data, needle],
  )

  const { title, subtitle } = KIND_TITLES[kind]
  const shownCount =
    kind === 'intake' ? (intakeView === 'orders' ? filteredIntakeOrders.length : filteredIntakeItems.length) : filteredRows.length

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-2xl sm:max-w-5xl">
        <header className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-extrabold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-dark">{subtitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-bg px-2.5 py-1 text-xs font-bold text-ink">{date}</span>
              <span className="text-xs font-semibold text-gray-dark">{shownCount} ta yozuv</span>
            </div>
            {totals.length > 0 && (
              <div className="mt-2 inline-flex rounded-lg bg-brand-primary/10 px-2.5 py-1.5">
                <span className="text-brand-primary">
                  <UnitTotals totals={totals} size="sm" />
                </span>
              </div>
            )}
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
              placeholder="Buyurtma №, mijoz, telefon yoki mahsulot nomi"
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

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {kind === 'intake' ? (
            intakeView === 'orders' ? (
              <ReportTable
                columns={intakeOrderColumns}
                rows={filteredIntakeOrders}
                rowKey={(o) => o.orderId}
                empty="Bu kunda sexga buyurtma kelmagan"
              />
            ) : intakeItems.isLoading ? (
              <Spinner className="py-10" />
            ) : intakeItems.isError ? (
              <p className="py-12 text-center text-sm text-gray-dark">Mahsulotlarni yuklab bo'lmadi</p>
            ) : (
              <ReportTable
                columns={intakeItemColumns}
                rows={filteredIntakeItems}
                rowKey={(r) => r.itemId}
                empty="Bu kunda mahsulot topilmadi"
              />
            )
          ) : (
            <ReportTable
              columns={activityColumns(kind)}
              rows={filteredRows}
              rowKey={(r) => r.id}
              empty="Bu kunda yozuv yo'q"
            />
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

/** Yuvildi / Upakovka / Yetkazildi — bosqich ro'yxati. */
function activityColumns(kind: DrawerKind): ReportColumn<ActivityRow>[] {
  return [
    { key: 'at', label: 'Vaqt', mobile: 'meta', render: (r) => formatTime(r.at) },
    { key: 'order', label: 'Buyurtma', mobile: 'title', render: (r) => <OrderNo value={r.orderNumber} /> },
    {
      key: 'item',
      label: 'Mahsulot',
      mobile: 'title',
      render: (r) => (
        <span className="text-ink">
          {r.itemNumber != null && <span className="mr-1.5 text-gray-dark">{r.itemNumber}.</span>}
          {r.itemName}
        </span>
      ),
    },
    {
      key: 'customer',
      label: 'Mijoz',
      mobile: 'sub',
      render: (r) => (
        <span className="text-gray-dark">
          {r.customerName || "Noma'lum"} · {r.phone}
        </span>
      ),
    },
    {
      key: 'volume',
      label: 'Hajmi',
      align: 'right',
      mobile: 'value',
      render: (r) => (
        <span className="font-bold text-ink">
          {formatAmount(r.unitAmount)} {r.unitLabel}
        </span>
      ),
    },
    {
      // ATAYLAB "Mahsulot narxi": qator BITTA mahsulotga tegishli, buyurtma
      // esa bir nechta mahsulotdan iborat bo'lishi mumkin. Avval ustun
      // shunchaki "Summa" deb nomlangani uchun uni buyurtma summasi deb
      // tushunish va "raqam noto'g'ri" degan xulosaga kelish oson edi.
      key: 'price',
      label: 'Mahsulot narxi',
      align: 'right',
      mobile: 'value',
      render: (r) => <span className="text-gray-dark">{formatMoney(r.price)}</span>,
    },
    {
      key: 'orderTotal',
      label: 'Buyurtma jami',
      align: 'right',
      mobile: 'meta',
      render: (r) =>
        r.orderTotalPrice == null ? (
          '—'
        ) : (
          <span>
            {formatMoney(r.orderTotalPrice)}
            {r.orderItemCount != null && r.orderItemCount > 1 && (
              <span className="ml-1 text-gray">({r.orderItemCount} ta mahsulot)</span>
            )}
          </span>
        ),
    },
    { key: 'actor', label: ACTOR_LABEL[kind], mobile: 'meta', render: (r) => r.employeeName },
    ...(kind === 'delivered'
      ? [
          {
            // Faqat dastavchik qo'lda boshqa summa kiritgan bo'lsa
            // ko'rsatiladi — kassa hisobida aynan shu raqam ishlatiladi.
            key: 'collected',
            label: 'Olingan summa',
            align: 'right' as const,
            mobile: 'meta' as const,
            render: (r: ActivityRow) =>
              r.collectedAmount != null && r.collectedAmount !== r.price ? (
                <span className="font-bold text-warning">{formatMoney(r.collectedAmount)}</span>
              ) : (
                '—'
              ),
          },
        ]
      : []),
  ]
}

const intakeOrderColumns: ReportColumn<IntakeOrderRow>[] = [
  { key: 'at', label: 'Vaqt', mobile: 'meta', render: (o) => formatTime(o.at) },
  {
    key: 'order',
    label: 'Buyurtma',
    mobile: 'title',
    render: (o) => (
      <span className="flex items-center gap-1.5">
        <OrderNo value={o.orderNumber} />
        {o.intakeMethod === 'walk_in' && (
          <span className="rounded bg-info-bg px-1.5 py-0.5 text-[10px] font-bold text-info">O'zi keldi</span>
        )}
      </span>
    ),
  },
  { key: 'customer', label: 'Mijoz', mobile: 'title', render: (o) => o.customerName || "Noma'lum" },
  { key: 'phone', label: 'Telefon', mobile: 'sub', render: (o) => <span className="text-gray-dark">{o.phone}</span> },
  {
    key: 'items',
    label: 'Mahsulot',
    align: 'right',
    mobile: 'meta',
    render: (o) => (
      <span>
        {o.itemCount} ta
        {o.unmeasuredCount > 0 && <span className="ml-1 font-bold text-danger">({o.unmeasuredCount} o'lchanmagan)</span>}
      </span>
    ),
  },
  {
    key: 'volume',
    label: 'Hajmi',
    align: 'right',
    mobile: 'value',
    render: (o) => (
      <span className="inline-flex justify-end">
        <UnitTotals totals={o.totals} size="sm" />
      </span>
    ),
  },
  {
    key: 'price',
    label: 'Summa',
    align: 'right',
    mobile: 'value',
    render: (o) => <span className="text-gray-dark">{formatMoney(o.totalPrice)}</span>,
  },
  { key: 'actor', label: 'Olib keldi', mobile: 'meta', render: (o) => o.broughtInByName || '—' },
]

const intakeItemColumns: ReportColumn<IntakeItemRow>[] = [
  {
    key: 'order',
    label: 'Buyurtma',
    mobile: 'title',
    render: (r) => <OrderNo value={r.orderNumber} />,
  },
  {
    key: 'item',
    label: 'Mahsulot',
    mobile: 'title',
    render: (r) => (
      <span className="text-ink">
        {r.itemNumber != null && <span className="mr-1.5 text-gray-dark">{r.itemNumber}.</span>}
        {r.itemName}
      </span>
    ),
  },
  {
    key: 'customer',
    label: 'Mijoz',
    mobile: 'sub',
    render: (r) => (
      <span className="text-gray-dark">
        {r.customerName || "Noma'lum"} · {r.phone}
      </span>
    ),
  },
  {
    key: 'size',
    label: "O'lchami",
    mobile: 'meta',
    render: (r) => (r.width && r.height ? `${r.width} × ${r.height} m` : '—'),
  },
  {
    key: 'tariff',
    label: 'Tarif',
    mobile: 'meta',
    render: (r) => {
      const t = r.tariff ? TARIFF_CONFIG[r.tariff] : null
      return t ? <span style={{ color: t.color }}>{t.label}</span> : '—'
    },
  },
  {
    key: 'status',
    label: 'Holati',
    mobile: 'meta',
    render: (r) => (r.status ? (STATUS_CONFIG[r.status]?.label ?? r.status) : '—'),
  },
  {
    key: 'volume',
    label: 'Hajmi',
    align: 'right',
    mobile: 'value',
    render: (r) =>
      r.unitAmount > 0 ? (
        <span className="font-bold text-ink">
          {formatAmount(r.unitAmount)} {r.unitLabel}
        </span>
      ) : (
        <span className="font-bold text-danger">O'lchanmagan</span>
      ),
  },
  {
    key: 'price',
    label: 'Narxi',
    align: 'right',
    mobile: 'value',
    render: (r) => <span className={r.price > 0 ? 'text-gray-dark' : 'font-bold text-danger'}>{formatMoney(r.price)}</span>,
  },
]

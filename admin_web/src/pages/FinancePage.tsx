import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins, Wallet, Percent, Check, Search, CalendarDays } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { ReportTable, type ReportColumn } from '@/components/dashboard/ReportTable'
import { businessDateKey } from '@/lib/business-time'
import { ApiError } from '@/lib/api'
import { fetchPayments, settlePayment, type PaymentRow } from '@/lib/payments'

type Tab = 'debt' | 'partial' | 'discount'

const TABS: { key: Tab; label: string; icon: typeof HandCoins }[] = [
  { key: 'debt', label: 'Qarzdorlar', icon: HandCoins },
  { key: 'partial', label: "Qisman to'lovlar", icon: Wallet },
  { key: 'discount', label: 'Chegirmalar', icon: Percent },
]

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function formatDay(dateKey: string): string {
  return dateKey
}

/**
 * Qarz, qisman to'lov va chegirmalar — bitta bo'limda, uchtasi alohida
 * ko'rinishda.
 *
 * Qarz va qisman to'lov OCHIQ yozuvlar (`settled == false`) bo'yicha
 * so'raladi — sana chegarasi yo'q, chunki eski qarz ham yopilmaguncha
 * ro'yxatda turishi kerak. Chegirma esa hodisa: u yopilmaydi, shuning
 * uchun sana oralig'i bo'yicha olinadi.
 */
export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('debt')
  const [search, setSearch] = useState('')
  const today = businessDateKey(new Date())
  const [from, setFrom] = useState(() => businessDateKey(new Date(Date.now() - 29 * 24 * 60 * 60_000)))

  const outstanding = useQuery({
    queryKey: ['payments', 'outstanding'],
    queryFn: () => fetchPayments({ scope: 'outstanding' }),
    staleTime: 30_000,
  })

  const history = useQuery({
    queryKey: ['payments', 'history', from, today],
    queryFn: () => fetchPayments({ scope: 'history', from, to: today }),
    enabled: tab === 'discount',
    staleTime: 60_000,
  })

  const loading = tab === 'discount' ? history.isLoading : outstanding.isLoading
  const error = tab === 'discount' ? history.isError : outstanding.isError

  const rows = useMemo(() => {
    const source = tab === 'discount' ? (history.data?.rows ?? []) : (outstanding.data?.rows ?? [])
    const needle = search.trim().toLowerCase()
    return source
      .filter((r) => (tab === 'discount' ? r.kind === 'discount' : r.kind === tab && !r.settled))
      .filter(
        (r) =>
          !needle ||
          [r.orderNumber, r.customerName, r.phone, r.employeeName].some((f) =>
            String(f).toLowerCase().includes(needle),
          ),
      )
  }, [tab, search, outstanding.data, history.data])

  const totals = outstanding.data?.totals
  const discountTotals = history.data?.totals

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Qarz va chegirmalar</h1>
        <p className="mt-1 text-sm text-gray-dark">Yetkazishda to'liq to'lanmagan buyurtmalar</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <SummaryTile
          icon={HandCoins}
          tone="danger"
          label="Qarz"
          count={totals?.debtCount ?? 0}
          amount={totals?.debtAmount ?? 0}
          loading={outstanding.isLoading}
        />
        <SummaryTile
          icon={Wallet}
          tone="warning"
          label="Qisman to'lov"
          count={totals?.partialCount ?? 0}
          amount={totals?.partialAmount ?? 0}
          loading={outstanding.isLoading}
        />
        <SummaryTile
          icon={Percent}
          tone="info"
          label="Chegirma"
          count={discountTotals?.discountCount ?? 0}
          amount={discountTotals?.discountAmount ?? 0}
          loading={tab === 'discount' && history.isLoading}
          hint={tab === 'discount' ? undefined : "Chegirmalar bo'limini oching"}
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="space-y-3 border-b border-border p-3 sm:p-4">
          <div className="flex rounded-xl border border-border bg-bg p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                  tab === t.key ? 'bg-brand-primary text-white' : 'text-ink/70'
                }`}
              >
                <t.icon size={14} className="shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-3">
            <div className="relative min-w-0 sm:flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buyurtma №, mijoz, telefon yoki dastavchik"
                className="h-11 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
              />
            </div>
            {tab === 'discount' && (
              <div className="relative min-w-0">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
                <input
                  type="date"
                  value={from}
                  max={today}
                  onChange={(e) => e.target.value && setFrom(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm font-semibold text-ink outline-none focus:border-brand-primary sm:w-44"
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <Spinner className="py-10" />
          ) : error ? (
            <p className="py-10 text-center text-sm font-semibold text-danger">Ma'lumotni yuklab bo'lmadi</p>
          ) : (
            <ReportTable
              columns={tab === 'discount' ? discountColumns : outstandingColumns}
              rows={rows}
              rowKey={(r) => r.id}
              empty={tab === 'debt' ? "Qarzdor yo'q" : tab === 'partial' ? "Qisman to'lov yo'q" : "Chegirma yo'q"}
            />
          )}
        </div>
      </section>
    </div>
  )
}

const TONES = {
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  info: 'bg-info-bg text-info',
}

function SummaryTile({
  icon: Icon,
  tone,
  label,
  count,
  amount,
  loading,
  hint,
}: {
  icon: typeof HandCoins
  tone: keyof typeof TONES
  label: string
  count: number
  amount: number
  loading: boolean
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon size={17} />
        </div>
        <span className="truncate text-sm font-bold text-ink">{label}</span>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-bg" />
      ) : (
        <>
          <div className="mt-3 truncate font-heading text-xl font-extrabold text-ink">{formatMoney(amount)}</div>
          <div className="mt-0.5 text-xs text-gray-dark">{hint ?? `${count} ta yozuv`}</div>
        </>
      )}
    </div>
  )
}

/** Ochiq yozuvlar (qarz / qisman) — "To'landi" tugmasi bilan. */
const outstandingColumns: ReportColumn<PaymentRow>[] = [
  { key: 'day', label: 'Sana', mobile: 'meta', render: (r) => formatDay(r.dateKey) },
  {
    key: 'order',
    label: 'Buyurtma',
    mobile: 'title',
    render: (r) => <span className="font-heading font-extrabold text-ink">#{r.orderNumber}</span>,
  },
  { key: 'customer', label: 'Mijoz', mobile: 'title', render: (r) => r.customerName || "Noma'lum" },
  { key: 'phone', label: 'Telefon', mobile: 'sub', render: (r) => <span className="text-gray-dark">{r.phone}</span> },
  { key: 'driver', label: 'Dastavchik', mobile: 'meta', render: (r) => r.employeeName },
  {
    key: 'due',
    label: 'Summa',
    align: 'right',
    mobile: 'meta',
    render: (r) => `${formatMoney(r.paidAmount)} / ${formatMoney(r.dueAmount)}`,
  },
  {
    key: 'shortfall',
    label: 'Qoldi',
    align: 'right',
    mobile: 'value',
    render: (r) => <span className="font-bold text-danger">{formatMoney(r.shortfall)}</span>,
  },
  { key: 'action', label: '', align: 'right', mobile: 'value', render: (r) => <SettleButton row={r} /> },
]

const discountColumns: ReportColumn<PaymentRow>[] = [
  { key: 'day', label: 'Sana', mobile: 'meta', render: (r) => formatDay(r.dateKey) },
  {
    key: 'order',
    label: 'Buyurtma',
    mobile: 'title',
    render: (r) => <span className="font-heading font-extrabold text-ink">#{r.orderNumber}</span>,
  },
  { key: 'customer', label: 'Mijoz', mobile: 'title', render: (r) => r.customerName || "Noma'lum" },
  { key: 'phone', label: 'Telefon', mobile: 'sub', render: (r) => <span className="text-gray-dark">{r.phone}</span> },
  { key: 'driver', label: 'Kim berdi', mobile: 'meta', render: (r) => r.employeeName },
  {
    key: 'due',
    label: 'Summa',
    align: 'right',
    mobile: 'meta',
    render: (r) => `${formatMoney(r.paidAmount)} / ${formatMoney(r.dueAmount)}`,
  },
  {
    key: 'discount',
    label: 'Chegirma',
    align: 'right',
    mobile: 'value',
    render: (r) => <span className="font-bold text-info">{formatMoney(r.shortfall)}</span>,
  },
]

function SettleButton({ row }: { row: PaymentRow }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => settlePayment(row.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik'),
  })

  if (error) return <span className="text-[11px] font-semibold text-danger">{error}</span>

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      <Check size={13} />
      {mutation.isPending ? '...' : "To'landi"}
    </button>
  )
}

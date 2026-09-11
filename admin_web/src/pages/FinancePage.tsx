import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HandCoins,
  Wallet,
  Percent,
  Check,
  Search,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CreditCard,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { ReportTable, type ReportColumn } from '@/components/dashboard/ReportTable'
import { businessDateKey } from '@/lib/business-time'
import { ApiError } from '@/lib/api'
import { fetchPayments, settlePayment, type PaymentRow } from '@/lib/payments'
import { useEscapeClose } from '@/hooks/useEscapeClose'

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

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

/**
 * Pul qanday olingani — qisqa ko'rinishda. Bitta usul bo'lsa faqat uning
 * nomi chiqadi, aralashda esa ikkala summa ham ko'rsatiladi.
 */
function MethodCell({ cash, card }: { cash: number; card: number }) {
  if (card <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-dark">
        <Banknote size={12} className="shrink-0" />
        Naqd
      </span>
    )
  }
  if (cash <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-dark">
        <CreditCard size={12} className="shrink-0" />
        Karta
      </span>
    )
  }
  return (
    <span className="flex flex-col items-end gap-0.5 text-[11px] font-semibold text-gray-dark">
      <span className="whitespace-nowrap">Naqd {formatMoney(cash)}</span>
      <span className="whitespace-nowrap">Karta {formatMoney(card)}</span>
    </span>
  )
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
  // Chegirma YOPILMAYDIGAN hodisa: u ro'yxatdan hech qachon chiqmaydi va
  // oylar davomida yig'ilib ketadi. Shuning uchun BITTA kun bo'yicha
  // ko'rsatiladi. Qarz va qisman to'lov esa yopilgach ro'yxatdan o'zi
  // chiqadi, shuning uchun ularda sana chegarasi shart emas.
  const [day, setDay] = useState(today)

  const outstanding = useQuery({
    queryKey: ['payments', 'outstanding'],
    queryFn: () => fetchPayments({ scope: 'outstanding' }),
    staleTime: 30_000,
  })

  const history = useQuery({
    queryKey: ['payments', 'history', day],
    queryFn: () => fetchPayments({ scope: 'history', from: day, to: day }),
    enabled: tab === 'discount',
    // Bugungi kun jonli o'zgaradi, o'tgan kunlar esa o'zgarmaydi.
    staleTime: day === today ? 30_000 : Infinity,
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
          hint={
            tab === 'discount'
              ? `${discountTotals?.discountCount ?? 0} ta · ${day === today ? 'bugun' : day}`
              : "Chegirmalar bo'limini oching"
          }
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
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  onClick={() => setDay(shiftDateKey(day, -1))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-gray-dark hover:bg-bg"
                  aria-label="Oldingi kun"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="relative min-w-0 flex-1">
                  <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
                  <input
                    type="date"
                    value={day}
                    max={today}
                    onChange={(e) => e.target.value && setDay(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm font-semibold text-ink outline-none focus:border-brand-primary sm:w-44"
                  />
                </div>
                <button
                  onClick={() => setDay(shiftDateKey(day, 1))}
                  disabled={day >= today}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-gray-dark hover:bg-bg disabled:opacity-40"
                  aria-label="Keyingi kun"
                >
                  <ChevronRight size={18} />
                </button>
                {day !== today && (
                  <button
                    onClick={() => setDay(today)}
                    className="h-11 shrink-0 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white"
                  >
                    Bugun
                  </button>
                )}
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
    key: 'method',
    label: 'Usul',
    align: 'right',
    mobile: 'meta',
    render: (r) => <MethodCell cash={r.cashAmount} card={r.cardAmount} />,
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
    key: 'method',
    label: 'Usul',
    align: 'right',
    mobile: 'meta',
    render: (r) => <MethodCell cash={r.cashAmount} card={r.cardAmount} />,
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
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        <Check size={13} />
        To'landi
      </button>
      {open && <SettleDialog row={row} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Qarzni yopish oynasi — summani ko'rsatadi va pul QANDAY olinganini
 * so'raydi.
 *
 * Usul so'ralmasa yopilgan pulning hammasi naqd deb sanalar va kunlik
 * kassa hisobi noto'g'ri chiqardi: karta orqali yopilgan qarz ham
 * dastavchik qo'lidagi pulga qo'shilib ketardi.
 */
function SettleDialog({ row, onClose }: { row: PaymentRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed'>('cash')
  const [cashPart, setCashPart] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEscapeClose(onClose)

  const amount = row.shortfall
  const parsedCash = cashPart.trim() === '' ? null : Number(cashPart)
  const split =
    method === 'cash'
      ? { cashAmount: amount, cardAmount: 0 }
      : method === 'card'
        ? { cashAmount: 0, cardAmount: amount }
        : parsedCash != null && Number.isFinite(parsedCash) && parsedCash >= 0 && parsedCash <= amount
          ? { cashAmount: parsedCash, cardAmount: amount - parsedCash }
          : null

  const mutation = useMutation({
    mutationFn: () => settlePayment({ paymentId: row.id, ...split! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <h3 className="font-heading text-lg font-extrabold text-ink">Qolgan pulni yopish</h3>
        <p className="mt-0.5 text-xs text-gray-dark">
          Buyurtma #{row.orderNumber} · {row.customerName || "Noma'lum"}
        </p>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-bg px-3 py-2.5">
          <span className="text-xs font-semibold text-gray-dark">Olinayotgan summa</span>
          <span className="whitespace-nowrap font-heading text-base font-extrabold text-ink">{formatMoney(amount)}</span>
        </div>

        <p className="mt-4 text-xs font-bold text-ink">Qanday to'landi?</p>
        <div className="mt-2 flex gap-2">
          {(
            [
              { id: 'cash', label: 'Naqd', icon: Banknote },
              { id: 'card', label: 'Karta', icon: CreditCard },
              { id: 'mixed', label: 'Aralash', icon: Wallet },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMethod(id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors ${
                method === id
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-border bg-bg text-gray-dark hover:border-brand-primary/40'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {method === 'mixed' && (
          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-dark">Naqd qismi</label>
            <input
              type="number"
              min={0}
              max={amount}
              value={cashPart}
              onChange={(e) => setCashPart(e.target.value)}
              placeholder="0"
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-bold text-ink outline-none focus:border-brand-primary"
            />
            <p className={`mt-1.5 text-xs font-semibold ${split ? 'text-gray-dark' : 'text-danger'}`}>
              {split ? `Karta orqali: ${formatMoney(split.cardAmount)}` : 'Naqd qismini 0 va summa orasida kiriting'}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-bg py-2.5 text-sm font-bold text-gray-dark hover:text-ink"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!split || mutation.isPending}
            className="flex-1 rounded-xl bg-brand-primary py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? '...' : 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

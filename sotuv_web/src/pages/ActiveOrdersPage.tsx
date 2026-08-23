import { useMemo, useState } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { useRecentOrders } from '@/hooks/useRecentOrders'
import { isOverdue, type Order } from '@/lib/orders'
import { TARIFF_CONFIG, TARIFF_ORDER } from '@/lib/status-config'
import { formatDateUz, formatDateTimeUz } from '@/lib/date-utils'
import { formatPhoneDisplay } from '@/lib/phone'
import { StatusBadge, TariffBadge } from '@/components/Badge'
import { Spinner } from '@/components/Spinner'
import { OrderDetailDrawer } from '@/components/OrderDetailDrawer'

function tariffWeight(tariff: string | null): number {
  if (!tariff) return TARIFF_ORDER.length
  const i = TARIFF_ORDER.indexOf(tariff)
  return i === -1 ? TARIFF_ORDER.length : i
}

export default function ActiveOrdersPage() {
  const { orders, loading } = useRecentOrders()
  const [search, setSearch] = useState('')
  const [tariffFilter, setTariffFilter] = useState<string | null>(null)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = orders.filter((o) => o.status !== 'done')
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          o.phone.toLowerCase().includes(q) ||
          o.orderNumber.toString().includes(q),
      )
    }
    if (tariffFilter) list = list.filter((o) => o.tariff === tariffFilter)
    if (overdueOnly) list = list.filter((o) => isOverdue(o))

    list = [...list].sort((a, b) => {
      const ao = isOverdue(a)
      const bo = isOverdue(b)
      if (ao !== bo) return ao ? -1 : 1
      const tw = tariffWeight(a.tariff) - tariffWeight(b.tariff)
      if (tw !== 0) return tw
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
    return list
  }, [orders, search, tariffFilter, overdueOnly])

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-ink">Faol buyurtmalar</h1>
          <p className="mt-1 text-sm text-gray-dark">{filtered.length} ta buyurtma</p>
        </div>
        <div className="relative w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dark" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon yoki # bo'yicha qidirish"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip
          label="Barchasi"
          active={!tariffFilter && !overdueOnly}
          onClick={() => {
            setTariffFilter(null)
            setOverdueOnly(false)
          }}
        />
        {TARIFF_ORDER.map((t) => (
          <FilterChip
            key={t}
            label={TARIFF_CONFIG[t].label}
            color={TARIFF_CONFIG[t].color}
            active={tariffFilter === t}
            onClick={() => {
              setTariffFilter(tariffFilter === t ? null : t)
              setOverdueOnly(false)
            }}
          />
        ))}
        <FilterChip
          label="Kechikkan"
          color="#DC2626"
          icon={AlertTriangle}
          active={overdueOnly}
          onClick={() => {
            setOverdueOnly(!overdueOnly)
            if (!overdueOnly) setTariffFilter(null)
          }}
        />
      </div>

      {loading ? (
        <Spinner className="py-16" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-sm font-bold text-gray-dark">Buyurtmalar topilmadi</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/60 text-left text-xs font-bold uppercase tracking-wide text-gray-dark">
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Mijoz</th>
                <th className="px-5 py-3">Telefon</th>
                <th className="px-5 py-3">Xizmat</th>
                <th className="px-5 py-3">Holat</th>
                <th className="px-5 py-3">Tarif</th>
                <th className="px-5 py-3">Muddat</th>
                <th className="px-5 py-3">Yaratildi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <OrderRow key={order.id} order={order} onClick={() => setOpenOrderId(order.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openOrderId && <OrderDetailDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </div>
  )
}

function OrderRow({ order, onClick }: { order: Order; onClick: () => void }) {
  const overdue = isOverdue(order)
  return (
    <tr onClick={onClick} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg/60">
      <td className="px-5 py-3.5 font-extrabold text-brand-primary">#{order.orderNumber}</td>
      <td className="px-5 py-3.5 font-bold text-ink">{order.customerName || "Noma'lum"}</td>
      <td className="px-5 py-3.5 text-ink">{formatPhoneDisplay(order.phone)}</td>
      <td className="px-5 py-3.5 text-ink">{order.serviceType === 'onsite' ? 'Joyida' : 'Olib kelish'}</td>
      <td className="px-5 py-3.5">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-5 py-3.5">{order.tariff && <TariffBadge tariff={order.tariff} />}</td>
      <td className="px-5 py-3.5">
        {order.dueDate ? (
          <span className={overdue ? 'font-bold text-danger' : 'text-ink'}>{formatDateUz(order.dueDate)}</span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-5 py-3.5 text-gray-dark">{formatDateTimeUz(order.createdAt)}</td>
    </tr>
  )
}

function FilterChip({
  label,
  active,
  color,
  icon: Icon,
  onClick,
}: {
  label: string
  active: boolean
  color?: string
  icon?: typeof AlertTriangle
  onClick: () => void
}) {
  const c = color ?? '#5A148C'
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
      style={active ? { background: c, color: 'white' } : { background: 'var(--color-surface)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  )
}

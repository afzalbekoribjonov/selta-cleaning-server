import { PackagePlus } from 'lucide-react'
import { useDeliverySelfAddedItems } from '@/hooks/useDeliverySelfAddedItems'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { Spinner } from '@/components/ui/Spinner'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `${UZ_MONTHS_FULL[(m ?? 1) - 1]} ${y}`
}

/**
 * Dastavchik o'zi (mijoz oldida) qo'shgan mahsulotlar — sotuv menejeri
 * oldindan qo'shganlaridan farqli, oyma-oy soni va summasi (talab #7).
 * Faqat "delivery" bo'limidagi xodim uchun ko'rsatiladi.
 */
export function DeliverySelfAddedSection({ employeeId }: { employeeId: string }) {
  const { stats, loading } = useDeliverySelfAddedItems(employeeId)

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <PackagePlus size={18} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">O'zi qo'shgan mahsulotlar</h2>
      </div>
      <p className="mb-4 text-xs text-gray-dark">
        Mijoz oldida dastavchikning o'zi belgilagan mahsulotlar (sotuv menejeri oldindan qo'shganlari kirmaydi)
      </p>

      {loading ? (
        <Spinner className="py-8" />
      ) : !stats || stats.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-dark">Hali o'zi qo'shgan mahsulot yo'q</p>
      ) : (
        <div className="space-y-2">
          {stats.map((s) => (
            <div key={s.yearMonth} className="flex items-center justify-between gap-3 rounded-xl bg-bg p-3.5">
              <span className="text-sm font-semibold text-ink">{monthLabel(s.yearMonth)}</span>
              <div className="flex items-center gap-3 text-right">
                <span className="text-xs text-gray-dark">{s.count} ta mahsulot</span>
                <span className="text-sm font-bold text-brand-primary">{formatMoney(s.revenue)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

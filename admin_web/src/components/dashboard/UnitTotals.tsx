import { formatAmount, type UnitTotal } from '@/lib/daily-report'

/**
 * Birlik bo'yicha hajmlar — HAR BIRI ALOHIDA QATORDA.
 *
 * Avval ular bitta satrga "25 m² · 3 dona" ko'rinishida qo'shilardi va
 * o'qilmasdi: ikki xil o'lchov birligi yonma-yon turganda ular bitta
 * qiymatdek ko'rinardi. Kvadrat metr, kilogramm va dona bir-biriga
 * qo'shilmaydigan kattaliklar, shuning uchun ular ham vizual ravishda
 * ajratilgan.
 */
export function UnitTotals({
  totals,
  size = 'md',
  emptyText = '—',
}: {
  totals: UnitTotal[] | null | undefined
  size?: 'sm' | 'md'
  emptyText?: string
}) {
  if (!totals || totals.length === 0) {
    return <span className="text-gray-dark">{emptyText}</span>
  }

  const amountClass = size === 'sm' ? 'text-xs font-bold text-ink' : 'font-heading text-base font-extrabold text-ink'
  const labelClass = size === 'sm' ? 'text-[11px] text-gray-dark' : 'text-xs text-gray-dark'

  return (
    <span className="flex flex-col gap-0.5">
      {totals.map((t) => (
        <span key={t.unit} className="flex items-baseline gap-1">
          <span className={amountClass}>{formatAmount(t.amount)}</span>
          <span className={labelClass}>{t.label}</span>
        </span>
      ))}
    </span>
  )
}

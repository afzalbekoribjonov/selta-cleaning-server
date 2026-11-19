import { UNIT_LABELS, formatMoney, formatQty } from '@/lib/units'
import { cn } from '@/lib/utils'
import { sortByTariff, tariffMeta, unitRateFor, unitsText, type SalaryConfig, type Stage, type WorkLine } from '@/lib/work-period'

/** Maosh va statistika sahifasining kichik qismlari — bir xil ko'rinish. */

export function TariffChip({ tariff, className }: { tariff: string; className?: string }) {
  const m = tariffMeta(tariff)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', className)}
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  )
}

/**
 * Mahsulot × tarif × hajm jadvali. Maosh usuliga kirsa — birlik narxi va
 * ishbay summasi ham (yuvish usulida yuvilgani, pardozlashda qadoqlangani).
 * Sotuv menejerida — mahsulotlar summasi (foiz buyurtma jamidan, pastda).
 */
export function WorkLinesTable({
  lines,
  stage,
  salary,
  tone = 'default',
  showPrice = false,
}: {
  lines: WorkLine[]
  stage?: Stage
  salary?: SalaryConfig | null
  tone?: 'default' | 'danger'
  showPrice?: boolean
}) {
  const rateOf = (l: WorkLine) => (stage ? unitRateFor(salary ?? null, stage, l.unit) : null)
  const withPay = lines.some((l) => rateOf(l) !== null)
  const rows = sortByTariff(lines)
  const totalPay = withPay ? rows.reduce((s, l) => s + Math.round(l.amount * (rateOf(l) ?? 0)), 0) : 0

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-bg text-[11px] font-bold uppercase tracking-wide text-gray-dark">
          <tr>
            <th className="w-full px-3 py-2 text-left">Mahsulot</th>
            <th className="hidden px-2 py-2 text-right sm:table-cell">Soni</th>
            <th className="px-2 py-2 text-right">Hajm</th>
            {withPay && <th className="hidden px-2 py-2 text-right md:table-cell">Narx</th>}
            {withPay && <th className="px-3 py-2 text-right">Ishbay</th>}
            {showPrice && <th className="px-3 py-2 text-right">Summa</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((l) => {
            const rate = rateOf(l)
            return (
              <tr key={`${l.name}|${l.tariff}|${l.unit}`} className="align-middle">
                <td className="max-w-0 px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('min-w-0 font-semibold [overflow-wrap:anywhere]', tone === 'danger' ? 'text-danger' : 'text-ink')}>{l.name}</span>
                    <TariffChip tariff={l.tariff} />
                    <span className="text-xs text-gray-dark sm:hidden">{l.count} ta</span>
                  </div>
                </td>
                <td className="hidden whitespace-nowrap px-2 py-2 text-right text-gray-dark sm:table-cell">{l.count} ta</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-bold text-ink">
                  {formatQty(l.amount, l.unit)} <span className="font-semibold text-gray-dark">{UNIT_LABELS[l.unit]}</span>
                </td>
                {withPay && (
                  <td className="hidden whitespace-nowrap px-2 py-2 text-right text-gray-dark md:table-cell">
                    {rate ? `× ${formatMoney(rate)}` : <span className="text-warning">narx yo'q</span>}
                  </td>
                )}
                {withPay && (
                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-brand-primary">
                    {formatMoney(Math.round(l.amount * (rate ?? 0)))}
                  </td>
                )}
                {showPrice && <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-ink">{formatMoney(l.price)}</td>}
              </tr>
            )
          })}
        </tbody>
        {(rows.length > 1 || withPay) && (
          <tfoot className="bg-bg/70 text-xs">
            <tr>
              {/* Jami bitta katakda — birliklar ro'yxati tor ustunga siqilmaydi. */}
              <td colSpan={99} className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="font-bold text-ink">
                    Jami · {rows.reduce((s, l) => s + l.count, 0)} ta
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-right">
                    <span className="font-bold text-ink">{unitsText(rows)}</span>
                    {showPrice && <span className="font-bold text-ink">{formatMoney(rows.reduce((s, l) => s + l.price, 0))}</span>}
                    {withPay && <span className="font-extrabold text-brand-primary">{formatMoney(totalPay)}</span>}
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary text-sm font-extrabold text-white',
        className,
      )}
    >
      {letters || '?'}
    </div>
  )
}

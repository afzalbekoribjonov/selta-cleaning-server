import { useMemo, useState } from 'react'
import { Package, RotateCcw } from 'lucide-react'
import { Panel, Segmented } from '@/components/ui/Panel'
import { UNIT_LABELS, formatMoney, formatQty } from '@/lib/units'
import { TARIFF_ORDER, countOf, tariffMeta, unitsText, type ProductStat, type Stage, type WorkEmployee, type WorkLine } from '@/lib/work-period'
import { Initials, TariffChip } from './WorkParts'

const STAGES: { value: Stage; label: string; empty: string }[] = [
  { value: 'washed', label: 'Yuvildi', empty: 'Bu davrda yuvilgan mahsulot yo\'q' },
  { value: 'packed', label: 'Qadoqlandi', empty: 'Bu davrda qadoqlangan mahsulot yo\'q' },
  { value: 'delivered', label: 'Topshirildi', empty: 'Bu davrda topshirilgan mahsulot yo\'q' },
  { value: 'returned', label: 'Qaytarildi', empty: 'Bu davrda qayta yuvishga qaytgan mahsulot yo\'q' },
  { value: 'rewashed', label: 'Qayta yuvildi', empty: 'Bu davrda qayta yuvilgan mahsulot yo\'q' },
]

/**
 * Mahsulotlar statistikasi: masalan "Gilam, Premium — bugun 45,5 m²
 * yuvildi". Yuqorida tariflar bo'yicha jami, pastda mahsulot × tarif.
 */
export function ProductStatsPanel({ products }: { products: ProductStat[] }) {
  const [stage, setStage] = useState<Stage>('washed')

  const lines = useMemo(
    () =>
      products
        .map((p) => p[stage])
        .filter((l): l is WorkLine => l !== null && l.count > 0)
        .sort((a, b) => TARIFF_ORDER.indexOf(a.tariff) - TARIFF_ORDER.indexOf(b.tariff) || b.amount - a.amount),
    [products, stage],
  )

  const byTariff = useMemo(() => {
    const map = new Map<string, WorkLine[]>()
    for (const l of lines) map.set(l.tariff, [...(map.get(l.tariff) ?? []), l])
    return TARIFF_ORDER.filter((t) => map.has(t)).map((t) => ({ tariff: t, lines: map.get(t)! }))
  }, [lines])

  // Bar uzunligi — shu birlikdagi eng katta hajmga nisbatan.
  const maxByUnit = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of lines) m[l.unit] = Math.max(m[l.unit] ?? 0, l.amount)
    return m
  }, [lines])

  const counts = Object.fromEntries(
    STAGES.map((s) => [s.value, products.reduce((sum, p) => sum + (p[s.value]?.count ?? 0), 0)]),
  ) as Record<Stage, number>
  const current = STAGES.find((s) => s.value === stage)!
  const unpaidNote = stage === 'rewashed' && lines.length > 0

  return (
    <Panel
      title="Mahsulotlar bo'yicha"
      subtitle="Qaysi mahsulot, qaysi tarifda, qancha hajmda"
      icon={Package}
      actions={
        <Segmented
          value={stage}
          onChange={setStage}
          options={STAGES.map((s) => ({
            value: s.value,
            label: (
              <span className={(s.value === 'returned' || s.value === 'rewashed') && counts[s.value] > 0 ? 'text-danger' : undefined}>
                {s.label} <span className="opacity-60">{counts[s.value]}</span>
              </span>
            ),
          }))}
        />
      }
    >
      {lines.length === 0 ? (
        <p className="rounded-xl bg-bg py-10 text-center text-sm text-gray-dark">{current.empty}</p>
      ) : (
        <div className="space-y-4">
          {unpaidNote && (
            <p className="rounded-xl bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">
              Qayta yuvish uchun haq to'lanmaydi va u "Yuvildi" jamiga qo'shilmaydi.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {byTariff.map(({ tariff, lines: tl }) => {
              const m = tariffMeta(tariff)
              return (
                <div key={tariff} className="relative overflow-hidden rounded-xl border border-border bg-surface p-3">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: m.color }} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold" style={{ color: m.color }}>
                      {m.label}
                    </span>
                    <span className="text-[11px] font-bold text-gray-dark">{countOf(tl)} ta</span>
                  </div>
                  <div className="mt-1 text-sm font-extrabold leading-snug text-ink">{unitsText(tl)}</div>
                </div>
              )
            })}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {lines.map((l) => {
              const m = tariffMeta(l.tariff)
              const pct = maxByUnit[l.unit] > 0 ? (l.amount / maxByUnit[l.unit]) * 100 : 0
              return (
                <li key={`${l.name}|${l.tariff}|${l.unit}`} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{l.name}</span>
                    <TariffChip tariff={l.tariff} />
                    <span className="w-24 shrink-0 text-right text-sm font-extrabold text-ink sm:w-28">
                      {formatQty(l.amount, l.unit)} <span className="font-semibold text-gray-dark">{UNIT_LABELS[l.unit]}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: m.color }} />
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-gray-dark">
                      {l.count} ta · {formatMoney(l.price)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Panel>
  )
}

/**
 * Qayta yuvishga qaytganlar — har bir yuvuvchi bo'yicha: qancha mahsulot,
 * qancha hajm va yuvganlariga nisbatan ulushi. Mahsulot qaytarilganda
 * yuvuvchiga jiddiy ogohlantirish ham yuboriladi (server).
 */
export function RewashPanel({ employees }: { employees: WorkEmployee[] }) {
  const rows = useMemo(
    () =>
      employees
        .filter((e) => e.work.returned.length > 0)
        .map((e) => ({ e, returned: countOf(e.work.returned), washed: countOf(e.work.washed) }))
        .sort((a, b) => b.returned - a.returned || a.e.fullName.localeCompare(b.e.fullName)),
    [employees],
  )
  const all = rows.flatMap((r) => r.e.work.returned)

  return (
    <Panel
      title="Qayta yuvishga qaytganlar"
      subtitle={rows.length ? `${countOf(all)} ta mahsulot · ${unitsText(all)}` : 'Yuvuvchilar bo\'yicha'}
      icon={RotateCcw}
    >
      {rows.length === 0 ? (
        <div className="rounded-xl bg-success-bg/60 py-8 text-center">
          <p className="text-sm font-bold text-success">Bu davrda qayta yuvishga qaytgan mahsulot yo'q</p>
          <p className="mt-0.5 text-xs text-gray-dark">Sifat a'lo darajada</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ e, returned, washed }) => (
            <li key={e.id} className="rounded-xl border border-danger/20 bg-danger-bg/30 p-3">
              <div className="flex items-center gap-3">
                <Initials name={e.fullName} className="h-9 w-9 rounded-xl from-danger to-danger/70 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-ink">{e.fullName}</div>
                  <div className="text-xs text-gray-dark">
                    {unitsText(e.work.returned)}
                    {washed > 0 && <> · yuvganining {Math.round((returned / washed) * 100)}%</>}
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-danger px-2 py-1 text-xs font-extrabold text-white">{returned} ta</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.work.returned.map((l) => (
                  <span
                    key={`${l.name}|${l.tariff}|${l.unit}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-[11px] font-semibold text-ink"
                  >
                    {l.name} · {formatQty(l.amount, l.unit)} {UNIT_LABELS[l.unit]}
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tariffMeta(l.tariff).color }} title={tariffMeta(l.tariff).label} />
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

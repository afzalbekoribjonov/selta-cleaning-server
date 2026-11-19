import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ExternalLink, Phone, RotateCcw, Settings2 } from 'lucide-react'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { PRODUCT_CATEGORY_CONFIG, type ProductCategory } from '@/lib/products'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'
import { countOf, hasAnyWork, unitsText, type WorkEmployee } from '@/lib/work-period'
import { Initials, WorkLinesTable } from './WorkParts'

/**
 * Bitta xodim: ism, telefon, kasbi va yuvadigan mahsulotlari, maosh usuli
 * (belgilanmagan bo'lsa — qizil), davrdagi ishi qisqacha va hisoblangan
 * summa. Bosilganda — mahsulot × tarif × hajm jadvallari va maosh tarkibi.
 */
export function EmployeeWorkCard({
  employee: e,
  departmentLabel,
  isMonth,
  onConfigureSalary,
}: {
  employee: WorkEmployee
  departmentLabel: string
  isMonth: boolean
  onConfigureSalary: (employee: WorkEmployee) => void
}) {
  const [open, setOpen] = useState(false)
  const w = e.work
  const worked = hasAnyWork(w)
  const method = e.salary ? (SALARY_METHODS[e.salary.method]?.label ?? e.salary.method) : null
  const returnedCount = countOf(w.returned)

  const summary: { label: string; value: string; tone?: 'danger' }[] = []
  if (w.washed.length) summary.push({ label: 'Yuvdi', value: unitsText(w.washed) })
  if (w.packed.length) summary.push({ label: 'Qadoqladi', value: unitsText(w.packed) })
  if (w.delivered.length) summary.push({ label: 'Topshirdi', value: `${countOf(w.delivered)} ta` })
  if (w.created.orders) summary.push({ label: 'Ochdi', value: `${w.created.orders} ta buyurtma` })
  if (w.pickedUp.orders) summary.push({ label: 'Olib keldi', value: `${w.pickedUp.orders} ta buyurtma` })
  if (w.onsite.orders || w.onsiteTeam.orders) summary.push({ label: 'Joyida', value: `${Math.max(w.onsite.orders, w.onsiteTeam.orders)} ta` })
  if (returnedCount) summary.push({ label: 'Qayta yuvishga', value: `${returnedCount} ta`, tone: 'danger' })

  const payAmount = e.pay ? (
    <span className={cn('whitespace-nowrap font-heading font-extrabold', e.pay.total < 0 ? 'text-danger' : 'text-brand-primary')}>
      {formatMoney(e.pay.total)}
    </span>
  ) : (
    <span className="font-bold text-gray">—</span>
  )
  const payLabel = (
    <span className="text-[11px] font-semibold text-gray-dark">{e.pay ? (isMonth ? 'oylik' : 'ishbay') : 'maosh hisoblanmaydi'}</span>
  )

  return (
    <article className={cn('rounded-2xl border bg-surface transition-shadow', open ? 'border-brand-primary/30 shadow-md' : 'border-border hover:shadow-sm')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3.5 text-left sm:items-center sm:p-4"
        aria-expanded={open}
      >
        <Initials name={e.fullName} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate font-heading text-[15px] font-extrabold text-ink">{e.fullName}</span>
            {e.status !== 'active' && (
              <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase text-gray-dark">Ishdan ketgan</span>
            )}
            {method ? (
              <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-bold text-brand-primary">{method}</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-extrabold text-danger">
                <AlertTriangle size={11} />
                Belgilanmagan
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-dark">
            {e.phone && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums">
                <Phone size={11} />
                {e.phone}
              </span>
            )}
            <span className="min-w-0 truncate">
              {departmentLabel}
              {e.department === 'worker' && e.specializations.length > 0 && (
                <> · {e.specializations.map((s) => PRODUCT_CATEGORY_CONFIG[s as ProductCategory]?.label ?? s).join(', ')}</>
              )}
              {e.canPack && ' · upakovka'}
            </span>
          </div>
          {summary.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.map((s) => (
                <span
                  key={s.label}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[11px] font-semibold',
                    s.tone === 'danger' ? 'bg-danger-bg text-danger' : 'bg-bg text-ink',
                  )}
                >
                  <span className={s.tone === 'danger' ? 'text-danger/80' : 'text-gray-dark'}>{s.label}:</span> <b>{s.value}</b>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-gray-dark">Bu davrda ish qayd etilmagan</p>
          )}
          {/* Telefonda summa alohida qatorda — ism va telefon siqilmaydi. */}
          <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-dashed border-border pt-2 sm:hidden">
            {payLabel}
            <span className="text-base">{payAmount}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          <div className="hidden text-right sm:block">
            <div className="text-lg">{payAmount}</div>
            {payLabel}
          </div>
          <ChevronDown size={18} className={cn('text-gray-dark transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-3.5 pb-4 pt-3.5 sm:px-4">
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/employees/${e.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-primary/40 hover:text-brand-primary"
            >
              <ExternalLink size={13} />
              Profilni ochish
            </Link>
            {e.phone && (
              <a
                href={`tel:${e.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-primary/40 hover:text-brand-primary"
              >
                <Phone size={13} />
                Qo'ng'iroq qilish
              </a>
            )}
          </div>
          {!e.salary && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-bg/60 p-3">
              <AlertTriangle size={18} className="shrink-0 text-danger" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-danger">Maosh usuli belgilanmagan — ishi qayd etiladi, lekin pul hisoblanmaydi.</p>
              <button
                onClick={() => onConfigureSalary(e)}
                className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white hover:bg-danger/90"
              >
                <Settings2 size={13} />
                Belgilash
              </button>
            </div>
          )}

          {w.washed.length > 0 && (
            <Block title="Yuvdi" hint={unitsText(w.washed)}>
              <WorkLinesTable lines={w.washed} stage="washed" salary={e.salary} />
            </Block>
          )}
          {w.packed.length > 0 && (
            <Block title="Qadoqladi" hint={unitsText(w.packed)}>
              <WorkLinesTable lines={w.packed} stage="packed" salary={e.salary} />
            </Block>
          )}
          {(w.created.orders > 0 || w.created.items.length > 0) && (
            <Block
              title="Ochgan buyurtmalari"
              hint={`${w.created.orders} ta buyurtma · ${formatMoney(w.created.revenue)}`}
              footer={<OrderNumbers numbers={w.created.orderNumbers} />}
            >
              {w.created.items.length > 0 ? (
                <WorkLinesTable lines={w.created.items} showPrice />
              ) : (
                <p className="text-xs text-gray-dark">Mahsulotlari hali qo'shilmagan</p>
              )}
            </Block>
          )}
          {(w.delivered.length > 0 || w.deliveredMoney.orders > 0) && (
            <Block
              title="Topshirdi"
              hint={`${countOf(w.delivered)} ta mahsulot · ${w.deliveredMoney.orders} ta buyurtma`}
              footer={
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-dark">
                  <span>
                    Mahsulotlar summasi: <b className="text-ink">{formatMoney(w.deliveredMoney.value)}</b>
                  </span>
                  <span>
                    Yig'ildi: <b className="text-ink">{formatMoney(w.deliveredMoney.collected)}</b>
                    {w.deliveredMoney.collected > 0 && (
                      <> (naqd {formatMoney(w.deliveredMoney.cash)}, karta {formatMoney(w.deliveredMoney.card)})</>
                    )}
                  </span>
                </div>
              }
            >
              {w.delivered.length > 0 && <WorkLinesTable lines={w.delivered} showPrice />}
            </Block>
          )}
          {w.pickedUp.orders > 0 && (
            <Block
              title="Mijozdan olib keldi"
              hint={`${w.pickedUp.orders} ta buyurtma · ${w.pickedUp.items} ta mahsulot`}
              footer={<OrderNumbers numbers={w.pickedUp.orderNumbers} />}
            />
          )}
          {(w.onsite.orders > 0 || w.onsiteTeam.orders > 0) && (
            <Block title="Joyida yuvish">
              <div className="grid gap-2 sm:grid-cols-2">
                {w.onsiteTeam.orders > 0 && (
                  <Mini label="Jamoada qatnashdi" value={`${w.onsiteTeam.orders} ta · ${formatMoney(w.onsiteTeam.revenue)}`} />
                )}
                {w.onsite.orders > 0 && (
                  <Mini label="Yakunlab pulini oldi" value={`${w.onsite.orders} ta · ${formatMoney(w.onsite.collected)}`} />
                )}
              </div>
            </Block>
          )}
          {w.returned.length > 0 && (
            <Block
              title={
                <span className="inline-flex items-center gap-1.5 text-danger">
                  <RotateCcw size={14} />
                  Qayta yuvishga qaytdi
                </span>
              }
              hint={unitsText(w.returned)}
            >
              <WorkLinesTable lines={w.returned} tone="danger" />
            </Block>
          )}
          {!worked && <p className="rounded-xl bg-bg py-4 text-center text-sm text-gray-dark">Tanlangan davrda bu xodim ish qayd etmagan</p>}

          {e.pay && <PayBreakdown pay={e.pay} isMonth={isMonth} onConfigure={() => onConfigureSalary(e)} />}
        </div>
      )}
    </article>
  )
}

function Block({ title, hint, children, footer }: { title: ReactNode; hint?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="text-sm font-extrabold text-ink">{title}</h4>
        {hint && <span className="text-xs font-semibold text-gray-dark">{hint}</span>}
      </div>
      {children}
      {footer}
    </section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg px-3 py-2">
      <div className="text-[11px] font-semibold text-gray-dark">{label}</div>
      <div className="text-sm font-bold text-ink">{value}</div>
    </div>
  )
}

function OrderNumbers({ numbers }: { numbers: number[] }) {
  const [all, setAll] = useState(false)
  if (numbers.length === 0) return null
  const shown = all ? numbers : numbers.slice(0, 14)
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((n) => (
        <span key={n} className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-gray-dark">
          #{n}
        </span>
      ))}
      {numbers.length > shown.length && (
        <button onClick={() => setAll(true)} className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-brand-primary hover:bg-brand-primary/10">
          yana {numbers.length - shown.length} ta
        </button>
      )}
    </div>
  )
}

function PayBreakdown({ pay, isMonth, onConfigure }: { pay: NonNullable<WorkEmployee['pay']>; isMonth: boolean; onConfigure: () => void }) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-primary/[0.07] to-brand-secondary/[0.05] p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-extrabold text-ink">Maosh hisobi</h4>
        <button onClick={onConfigure} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-brand-primary hover:bg-brand-primary/10">
          <Settings2 size={13} />
          Sozlash
        </button>
      </div>
      <dl className="space-y-1.5 text-sm">
        {pay.lines.map((l, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <dt className="min-w-0">
              <div className="font-semibold text-ink">{l.label}</div>
              <div className="text-xs text-gray-dark">{l.detail}</div>
            </dt>
            <dd className="shrink-0 whitespace-nowrap font-bold text-ink">{formatMoney(l.amount)}</dd>
          </div>
        ))}
        {pay.base > 0 && (
          <div className="flex items-start justify-between gap-3">
            <dt className="min-w-0">
              <div className="font-semibold text-ink">Baza (oylik)</div>
              {!isMonth && <div className="text-xs text-gray-dark">Butun oy tanlanganda qo'shiladi</div>}
            </dt>
            <dd className={cn('shrink-0 whitespace-nowrap font-bold', isMonth ? 'text-ink' : 'text-gray line-through')}>{formatMoney(pay.base)}</dd>
          </div>
        )}
        {pay.advances > 0 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold text-ink">Avanslar</dt>
            <dd className="shrink-0 whitespace-nowrap font-bold text-danger">− {formatMoney(pay.advances)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-brand-primary/15 pt-2">
          <dt className="font-extrabold text-ink">{isMonth ? "Oy uchun to'lanadi" : 'Davrdagi ishbay'}</dt>
          <dd className={cn('shrink-0 whitespace-nowrap font-heading text-lg font-extrabold', pay.total < 0 ? 'text-danger' : 'text-brand-primary')}>
            {formatMoney(pay.total)}
          </dd>
        </div>
      </dl>
    </section>
  )
}

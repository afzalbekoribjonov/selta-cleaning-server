import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Banknote, Check, ChevronDown, CreditCard, HandCoins, PiggyBank, Receipt, Undo2, Wallet, type LucideIcon } from 'lucide-react'
import { setCashHandover, type DailyReport } from '@/lib/daily-report'
import { formatMoney } from '@/lib/units'
import { cn } from '@/lib/utils'

/**
 * Kassa — tanlangan kuni xodimlar qo'liga tushgan pul va kassaga
 * topshirilishi kerak bo'lgan naqd. Qoldiq kundan-kunga o'tmaydi: har kun
 * o'z hisobiga ega, "Topshirdi" belgisi ham aynan shu kunga tegishli.
 *
 * Tepada bitta qarashda kerakli uch raqam (jami, naqd/karta, topshirilmagan
 * naqd), xodimlar bo'yicha batafsil ro'yxat — ochiladigan qismda.
 */
export function CashPanel({ date, report }: { date: string; report: DailyReport }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: ({ employeeId, handedOver, amount }: { employeeId: string; handedOver: boolean; amount: number }) =>
      setCashHandover(date, employeeId, handedOver, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailyReport', date] }),
  })

  const totals = useMemo(() => {
    const drivers = report.drivers
    return {
      amount: drivers.reduce((s, d) => s + d.amount, 0),
      cash: drivers.reduce((s, d) => s + d.cashAmount, 0),
      card: drivers.reduce((s, d) => s + d.cardAmount, 0),
      pending: drivers.filter((d) => !d.handedOver).reduce((s, d) => s + d.handOverAmount, 0),
      pendingCount: drivers.filter((d) => !d.handedOver && d.handOverAmount !== 0).length,
    }
  }, [report.drivers])

  if (report.drivers.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-gray-dark">
        <Wallet size={18} className="shrink-0 text-gray" />
        Bu kuni xodimlar qo'liga pul tushmagan
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-2xl bg-border sm:grid-cols-4">
        <CashStat icon={Wallet} label="Jami tushdi" value={formatMoney(totals.amount)} tone="ink" />
        <CashStat icon={Banknote} label="Naqd" value={formatMoney(totals.cash)} />
        <CashStat icon={CreditCard} label="Karta" value={formatMoney(totals.card)} />
        <CashStat
          icon={HandCoins}
          label="Topshirilmagan naqd"
          value={formatMoney(totals.pending)}
          tone={totals.pending > 0 ? 'warning' : 'success'}
        />
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold text-ink hover:bg-bg/60"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span>Xodimlar bo'yicha ({report.drivers.length})</span>
          {totals.pendingCount > 0 && (
            <span className="whitespace-nowrap rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning">
              {totals.pendingCount} ta topshirmagan
            </span>
          )}
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-gray-dark transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {report.drivers.map((d) => (
            <li key={d.employeeId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink">{d.name}</div>
                  <div className="text-xs text-gray-dark">
                    {d.orderCount} ta buyurtma · {d.itemCount} ta mahsulot
                  </div>
                </div>
                <div className="shrink-0 whitespace-nowrap font-heading text-sm font-extrabold tabular-nums text-ink">
                  {formatMoney(d.amount)}
                </div>
              </div>

              {/* Naqd va karta ALOHIDA: topshirish faqat naqdga tegishli. */}
              <div className="mt-2 grid gap-1 rounded-xl bg-bg px-3 py-2">
                <MoneyLine icon={Banknote} label="Naqd" amount={d.cashAmount} />
                <MoneyLine icon={CreditCard} label="Karta" amount={d.cardAmount} />
                {d.settledAmount > 0 && <MoneyLine icon={HandCoins} label="Shundan yopilgan qarz" amount={d.settledAmount} />}
                {d.prepaidAmount > 0 && <MoneyLine icon={PiggyBank} label="Shundan oldindan to'lov" amount={d.prepaidAmount} />}
                {d.expenseAmount > 0 && (
                  <>
                    <MoneyLine icon={Receipt} label="Naqddan chiqim" amount={-d.expenseAmount} />
                    <div className="truncate pl-[18px] text-[11px] text-gray-dark" title={expenseList(d.expenses)}>
                      {expenseList(d.expenses)}
                    </div>
                  </>
                )}
                <div className="mt-0.5 border-t border-border pt-1">
                  <MoneyLine
                    icon={Wallet}
                    label={d.handOverAmount < 0 ? 'Xodimga qaytariladi' : 'Kassaga topshiradi'}
                    amount={Math.abs(d.handOverAmount)}
                    bold
                    struck={d.handedOver}
                  />
                </div>
              </div>

              <button
                onClick={() => mutation.mutate({ employeeId: d.employeeId, handedOver: !d.handedOver, amount: d.handOverAmount })}
                disabled={mutation.isPending}
                className={cn(
                  'mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors disabled:opacity-50 sm:w-auto',
                  d.handedOver
                    ? 'border border-border bg-bg text-gray-dark hover:text-ink'
                    : 'bg-brand-primary text-white hover:opacity-90',
                )}
              >
                {d.handedOver ? <Undo2 size={14} /> : <Check size={14} />}
                {d.handedOver ? 'Topshirishni bekor qilish' : 'Naqd pulni topshirdi'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CashStat({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'default' | 'ink' | 'warning' | 'success'
}) {
  return (
    <div className="min-w-0 bg-surface px-3.5 py-3">
      <div className="flex items-start gap-1.5 text-[11px] font-semibold leading-tight text-gray-dark">
        <Icon size={13} className="mt-px shrink-0" />
        <span className="min-w-0">{label}</span>
      </div>
      <div
        className={cn(
          'mt-1 truncate font-heading text-[15px] font-extrabold tabular-nums sm:text-base',
          tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-ink',
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function expenseList(expenses: DailyReport['drivers'][number]['expenses']): string {
  return expenses.map((e) => `${e.name} ${formatMoney(e.amount)}`).join(', ')
}

function MoneyLine({
  icon: Icon,
  label,
  amount,
  struck = false,
  bold = false,
}: {
  icon: LucideIcon
  label: string
  amount: number
  struck?: boolean
  bold?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon size={12} className={cn('shrink-0', struck ? 'text-success' : 'text-gray')} />
      <span className={cn('min-w-0 truncate', bold ? 'font-bold text-ink' : 'text-gray-dark')}>{label}</span>
      <span className={cn('ml-auto whitespace-nowrap font-bold tabular-nums', struck ? 'text-success line-through' : 'text-ink')}>
        {formatMoney(amount)}
      </span>
    </div>
  )
}

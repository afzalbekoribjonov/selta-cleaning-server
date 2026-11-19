import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import {
  addDays,
  daysInRange,
  formatRange,
  lastDayOfMonth,
  monthLabel,
  monthOf,
  monthRange,
  rangePresets,
  sameRange,
  shiftMonth,
  todayKey,
  weekdayIndex,
  type DateRange,
} from '@/lib/uz-dates'

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

/**
 * Davr tanlagich: tugma + o'zbekcha kalendar oynasi. Bitta kun, istalgan
 * oraliq yoki butun kalendar oyi tanlanadi; tez tanlovlar (Bugun, Kecha,
 * Shu hafta, Shu oy …) bir bosishda qo'llanadi. Kelajak kunlari tanlanmaydi.
 */
export function PeriodPicker({
  value,
  onChange,
  maxDays = 92,
  className,
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  maxDays?: number
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const days = daysInRange(value)
  const isMonth = monthOf(value) !== null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group flex h-10 min-w-0 max-w-full items-center gap-2 rounded-xl border border-border bg-surface pl-3 pr-2.5 text-sm font-bold text-ink shadow-sm transition-colors hover:border-brand-primary/50',
          className,
        )}
        aria-haspopup="dialog"
      >
        <CalendarDays size={16} className="shrink-0 text-brand-primary" />
        <span className="min-w-0 truncate">{formatRange(value)}</span>
        {!isMonth && days > 1 && <span className="shrink-0 text-xs font-semibold text-gray-dark">· {days} kun</span>}
        <ChevronDown size={16} className="shrink-0 text-gray-dark transition-transform group-hover:translate-y-px" />
      </button>
      {open && (
        <PeriodDialog
          value={value}
          maxDays={maxDays}
          onClose={() => setOpen(false)}
          onPick={(r) => {
            setOpen(false)
            if (!sameRange(r, value)) onChange(r)
          }}
        />
      )}
    </>
  )
}

function PeriodDialog({
  value,
  maxDays,
  onClose,
  onPick,
}: {
  value: DateRange
  maxDays: number
  onClose: () => void
  onPick: (range: DateRange) => void
}) {
  useEscapeClose(onClose)
  const today = todayKey()
  const presets = useMemo(() => rangePresets(today), [today])
  const [month, setMonth] = useState(value.to.slice(0, 7))
  const [mode, setMode] = useState<'days' | 'months'>('days')
  const [start, setStart] = useState<string | null>(value.from)
  const [end, setEnd] = useState<string | null>(value.to)
  const [hover, setHover] = useState<string | null>(null)

  const currentMonth = today.slice(0, 7)
  const canNext = month < currentMonth

  const selection: DateRange | null = start ? { from: start, to: end ?? start } : null
  const tooLong = selection ? daysInRange(selection) > maxDays : false

  function tapDay(day: string) {
    if (!start || end) {
      setStart(day)
      setEnd(null)
    } else if (day < start) {
      setEnd(start)
      setStart(day)
    } else {
      setEnd(day)
    }
  }

  // Oraliq tanlanayotganda sichqoncha turgan kungacha oldindan ko'rsatiladi.
  const previewEnd = start && !end && hover ? hover : (end ?? start)
  const lo = start && previewEnd ? (start < previewEnd ? start : previewEnd) : null
  const hi = start && previewEnd ? (start < previewEnd ? previewEnd : start) : null

  const first = `${month}-01`
  const offset = weekdayIndex(first)
  const lastDay = Number(lastDayOfMonth(month).slice(8))
  const cells = Math.ceil((offset + lastDay) / 7) * 7

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Davrni tanlang"
    >
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-2xl sm:max-w-[680px] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-extrabold text-ink">Davrni tanlang</h2>
            <p className="text-xs text-gray-dark">Bitta kun, oraliq yoki butun oy</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-dark hover:bg-bg hover:text-ink" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[176px_1fr] sm:p-5">
          {/* Tez tanlovlar: telefonda gorizontal, kompyuterda ustun. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0">
            {presets.map((p) => {
              const active = sameRange(p.range, value)
              return (
                <button
                  key={p.key}
                  onClick={() => onPick(p.range)}
                  className={cn(
                    'flex shrink-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-bold transition-colors',
                    active
                      ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
                      : 'border-border bg-bg text-ink hover:border-brand-primary/40 hover:bg-brand-primary/5',
                  )}
                >
                  <span className="whitespace-nowrap">{p.label}</span>
                  <span className={cn('hidden whitespace-nowrap text-[11px] font-semibold sm:inline', active ? 'text-white/80' : 'text-gray-dark')}>
                    {p.range.from === p.range.to ? '' : `${daysInRange(p.range)} kun`}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => (mode === 'days' ? setMonth(shiftMonth(month, -1)) : setMonth(shiftMonth(month, -12)))}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-ink hover:bg-bg"
                aria-label={mode === 'days' ? 'Oldingi oy' : 'Oldingi yil'}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setMode(mode === 'days' ? 'months' : 'days')}
                className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-extrabold text-ink hover:bg-bg"
                title="Oylar ro'yxati"
              >
                <span className="truncate">{mode === 'days' ? monthLabel(month) : month.slice(0, 4)}</span>
                <ChevronDown size={15} className={cn('shrink-0 text-gray-dark transition-transform', mode === 'months' && 'rotate-180')} />
              </button>
              <button
                onClick={() => (mode === 'days' ? setMonth(shiftMonth(month, 1)) : setMonth(shiftMonth(month, 12) > currentMonth ? currentMonth : shiftMonth(month, 12)))}
                disabled={mode === 'days' ? !canNext : month.slice(0, 4) >= currentMonth.slice(0, 4)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-ink hover:bg-bg disabled:opacity-30"
                aria-label={mode === 'days' ? 'Keyingi oy' : 'Keyingi yil'}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {mode === 'months' ? (
              <div className="grid grid-cols-3 gap-2">
                {UZ_MONTHS_FULL.map((name, i) => {
                  const ym = `${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`
                  const future = ym > currentMonth
                  const active = monthOf(value) === ym
                  return (
                    <button
                      key={ym}
                      disabled={future}
                      onClick={() => onPick(monthRange(ym, today))}
                      className={cn(
                        'rounded-xl border px-2 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                        active ? 'border-brand-primary bg-brand-primary text-white' : 'border-border bg-bg text-ink hover:border-brand-primary/40',
                      )}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-gray-dark">
                  {WEEKDAYS.map((w, i) => (
                    <div key={w} className={cn('py-1', i >= 5 && 'text-danger/70')}>
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
                  {Array.from({ length: cells }, (_, i) => {
                    const n = i - offset + 1
                    if (n < 1 || n > lastDay) return <div key={i} className="h-10" />
                    const day = addDays(first, n - 1)
                    const future = day > today
                    const inRange = lo !== null && hi !== null && day >= lo && day <= hi
                    const isEdge = day === lo || day === hi
                    const col = i % 7
                    return (
                      <div
                        key={i}
                        className={cn(
                          'py-0.5',
                          inRange && !(lo === hi) && 'bg-brand-primary/10',
                          inRange && (day === lo || col === 0) && 'rounded-l-full',
                          inRange && (day === hi || col === 6) && 'rounded-r-full',
                        )}
                      >
                        <button
                          disabled={future}
                          onClick={() => tapDay(day)}
                          onMouseEnter={() => setHover(day)}
                          className={cn(
                            'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:text-gray/50',
                            isEdge ? 'bg-brand-primary text-white shadow-sm' : 'text-ink hover:bg-brand-primary/15',
                            day === today && !isEdge && 'ring-2 ring-brand-primary/40',
                          )}
                          aria-label={day}
                          aria-pressed={isEdge}
                        >
                          {n}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <button
                  onClick={() => onPick(monthRange(month, today))}
                  className="mt-3 w-full rounded-xl border border-dashed border-brand-primary/40 py-2 text-sm font-bold text-brand-primary hover:bg-brand-primary/5"
                >
                  Butun oy — {monthLabel(month)}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
          <div className="min-w-0 flex-1 text-sm">
            {tooLong ? (
              <span className="font-bold text-danger">Oraliq {maxDays} kundan oshmasin</span>
            ) : selection ? (
              <span className="font-bold text-ink">
                {formatRange(selection, today)}
                <span className="ml-1.5 font-semibold text-gray-dark">· {daysInRange(selection)} kun</span>
                {!end && <span className="block text-xs font-medium text-gray-dark">Tugash kunini tanlang yoki shu kunning o'zini oling</span>}
              </span>
            ) : (
              <span className="text-gray-dark">Boshlanish kunini tanlang</span>
            )}
          </div>
          <button onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-bold text-gray-dark hover:bg-bg">
            Bekor qilish
          </button>
          <button
            disabled={!selection || tooLong}
            onClick={() => selection && onPick(selection)}
            className="h-10 rounded-xl bg-brand-primary px-5 text-sm font-bold text-white shadow-sm hover:bg-brand-primary-dark disabled:opacity-40"
          >
            Tanlash
          </button>
        </div>
      </div>
    </div>
  )
}

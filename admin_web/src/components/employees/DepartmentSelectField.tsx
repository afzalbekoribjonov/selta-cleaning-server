import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useDepartmentLookup } from '@/hooks/useDepartmentLookup'

export interface DepartmentSelection {
  department?: string
  newDepartment?: { label: string; includeInStats: boolean }
}

const OTHER = '__other__'

/**
 * Doimiy 4 ta bo'lim + mavjud "Boshqa" kasblar + yangi "Boshqa" tanlovi
 * (bosilsa, Selta Cleaning brendlangan panel ochiladi — yangi kasb nomi va
 * "statistikaga qo'shilsinmi" belgisi). Ham xodim yaratishda, ham kasb
 * o'zgartirishda ishlatiladi — `mode` faqat matnlarni moslashtiradi.
 */
export function DepartmentSelectField({
  value,
  onChange,
  mode,
  excludeKey,
}: {
  value: DepartmentSelection
  onChange: (value: DepartmentSelection) => void
  mode: 'create' | 'change'
  /** "Kasb o'zgartirish"da xodimning joriy kasbini ro'yxatda ko'rsatmaslik uchun. */
  excludeKey?: string
}) {
  const { all, loading } = useDepartmentLookup()
  const options = useMemo(() => (excludeKey ? all.filter((d) => d.key !== excludeKey) : all), [all, excludeKey])
  const [selected, setSelected] = useState<string>(value.department ?? (value.newDepartment ? OTHER : options[0]?.key ?? OTHER))
  const [customLabel, setCustomLabel] = useState(value.newDepartment?.label ?? '')
  const [includeInStats, setIncludeInStats] = useState(value.newDepartment?.includeInStats ?? true)

  // `value.department` boshlang'ich holatda `excludeKey` bilan bir xil
  // bo'lishi mumkin (masalan kasb o'zgartirishda joriy kasb ro'yxatdan olib
  // tashlanadi) — bunday holda tanlangan qiymat ro'yxatda yo'q bo'lib
  // qoladi, shuning uchun birinchi mavjud tanlovga avtomatik moslashtiramiz.
  useEffect(() => {
    if (selected !== OTHER && !options.some((d) => d.key === selected)) {
      const fallback = options[0]?.key ?? OTHER
      setSelected(fallback)
      onChange(fallback === OTHER ? { newDepartment: { label: customLabel, includeInStats } } : { department: fallback })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  function handleSelectChange(next: string) {
    setSelected(next)
    if (next === OTHER) {
      onChange({ newDepartment: { label: customLabel, includeInStats } })
    } else {
      onChange({ department: next })
    }
  }

  function handleLabelChange(next: string) {
    setCustomLabel(next)
    onChange({ newDepartment: { label: next, includeInStats } })
  }

  function handleIncludeChange(next: boolean) {
    setIncludeInStats(next)
    onChange({ newDepartment: { label: customLabel, includeInStats: next } })
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink">Xodim bo'limi / kasbi</label>
      <select
        value={selected}
        disabled={loading}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
      >
        {options.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
            {d.isCustom ? " (qo'shimcha kasb)" : ''}
          </option>
        ))}
        <option value={OTHER}>Boshqa...</option>
      </select>

      {selected === OTHER && (
        <div
          className="relative mt-3 overflow-hidden rounded-2xl p-4"
          style={{ background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-primary-dark))' }}
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-2.5">
            <img src="/brand/icon_white.png" alt="Selta Cleaning" className="h-8 w-8 shrink-0 object-contain" />
            <span className="font-heading text-sm font-extrabold text-white">
              {mode === 'create' ? 'Yangi xodim' : 'Yangi kasb'}
            </span>
          </div>
          <p className="relative mt-3 text-xs font-semibold text-white/85">Selta Cleaning uchun yangi xodim kasbini yozing</p>
          <input
            autoFocus
            value={customLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Masalan: Buxgalter, Menejer"
            className="relative mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/50"
          />
          <label className="relative mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl bg-white/10 px-3.5 py-2.5">
            <input
              type="checkbox"
              checked={includeInStats}
              onChange={(e) => handleIncludeChange(e.target.checked)}
              className="h-4 w-4 accent-brand-accent"
            />
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Sparkles size={12} className="text-brand-accent" />
              Xodimlar statistikasiga ham qo'shilsin
            </span>
          </label>
        </div>
      )}
    </div>
  )
}

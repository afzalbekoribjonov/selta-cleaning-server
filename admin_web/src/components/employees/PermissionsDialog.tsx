import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { type Employee } from '@/lib/employees'
import { cn } from '@/lib/utils'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { PERMISSION_GROUPS, permissionsFor, type PermissionDef, type PermissionKey } from './permissions'

type RowState = { saving: boolean; note: { ok: boolean; text: string } | null }

/**
 * Xodim vakolatlari — bitta oynada, guruhlangan kalitlar (switch).
 * Bosilganda darhol saqlanadi; ostida nima o'zgargani qisqa yoziladi.
 * Avval har bir vakolat profil sahifasida alohida katta karta edi.
 */
export function PermissionsDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  useEscapeClose(onClose)
  const queryClient = useQueryClient()
  const terminated = employee.status !== 'active'
  const defs = permissionsFor(employee)
  const [overrides, setOverrides] = useState<Partial<Record<PermissionKey, boolean>>>({})
  const [rows, setRows] = useState<Partial<Record<PermissionKey, RowState>>>({})

  const valueOf = (key: PermissionKey) => overrides[key] ?? employee[key] === true
  const enabledCount = defs.filter((d) => valueOf(d.key)).length

  async function toggle(def: PermissionDef) {
    const next = !valueOf(def.key)
    setOverrides((o) => ({ ...o, [def.key]: next }))
    setRows((r) => ({ ...r, [def.key]: { saving: true, note: null } }))
    try {
      await def.save(employee.id, next)
      setRows((r) => ({ ...r, [def.key]: { saving: false, note: { ok: true, text: next ? def.onText : def.offText } } }))
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    } catch (err) {
      setOverrides((o) => ({ ...o, [def.key]: !next }))
      setRows((r) => ({
        ...r,
        [def.key]: { saving: false, note: { ok: false, text: err instanceof ApiError ? err.message : "Saqlab bo'lmadi — qayta urinib ko'ring" } },
      }))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Vakolatlar"
    >
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-extrabold text-ink">Vakolatlar</h2>
              <p className="truncate text-xs text-gray-dark">
                {employee.fullName} · <b className="text-ink">{enabledCount}</b> / {defs.length} yoqilgan
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-dark hover:bg-bg hover:text-ink" aria-label="Yopish">
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {terminated && (
            <p className="rounded-xl bg-bg px-3 py-2 text-xs font-semibold text-gray-dark">
              Ishdan ketgan xodimning vakolatlari o'zgartirilmaydi.
            </p>
          )}
          {PERMISSION_GROUPS.map((group) => {
            const list = defs.filter((d) => d.group === group)
            if (list.length === 0) return null
            return (
              <section key={group}>
                <h3 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-dark">{group}</h3>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {list.map((def) => {
                    const on = valueOf(def.key)
                    const row = rows[def.key]
                    const Icon = def.icon
                    return (
                      <li key={def.key} className={cn('px-3.5 py-3 transition-colors', on && 'bg-brand-primary/[0.03]')}>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                              on ? 'bg-brand-primary text-white' : 'bg-bg text-gray-dark',
                            )}
                          >
                            <Icon size={17} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-ink">{def.title}</div>
                            <div className="text-xs leading-snug text-gray-dark">{def.description}</div>
                          </div>
                          <Switch
                            checked={on}
                            busy={row?.saving === true}
                            disabled={terminated || row?.saving === true}
                            label={def.title}
                            onChange={() => toggle(def)}
                          />
                        </div>
                        {row?.note && (
                          <p
                            className={cn(
                              'ml-12 mt-1.5 flex items-start gap-1.5 text-xs font-semibold',
                              row.note.ok ? 'text-success' : 'text-danger',
                            )}
                          >
                            {row.note.ok && <CheckCircle2 size={13} className="mt-px shrink-0" />}
                            <span>{row.note.text}</span>
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          <p className="text-xs text-gray-dark">O'zgarish darhol saqlanadi — ilova keyingi ochilishda yangilanadi.</p>
          <button onClick={onClose} className="h-10 shrink-0 rounded-xl bg-brand-primary px-5 text-sm font-bold text-white shadow-sm hover:bg-brand-primary-dark">
            Tayyor
          </button>
        </footer>
      </div>
    </div>
  )
}

function Switch({
  checked,
  busy,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  busy: boolean
  disabled: boolean
  label: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:cursor-not-allowed',
        checked ? 'bg-brand-primary' : 'bg-border',
        disabled && !busy && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      >
        {busy && <Loader2 size={12} className="animate-spin text-brand-primary" />}
      </span>
    </button>
  )
}

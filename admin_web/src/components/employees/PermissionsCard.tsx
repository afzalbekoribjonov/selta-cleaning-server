import { useState } from 'react'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { type Employee } from '@/lib/employees'
import { PermissionsDialog } from './PermissionsDialog'
import { permissionsFor } from './permissions'

/** Profildagi vakolatlar xulosasi: yoqilganlari belgi sifatida + bitta tugma. */
export function PermissionsCard({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false)
  const defs = permissionsFor(employee)
  const enabled = defs.filter((d) => employee[d.key] === true)

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-ink">Vakolatlar</h2>
            <p className="text-xs text-gray-dark">
              {enabled.length} / {defs.length} yoqilgan — ilovada nimalarga ruxsat berilgan
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-primary-dark"
        >
          Vakolatlarni boshqarish
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {enabled.length === 0 ? (
          <span className="text-xs text-gray-dark">Qo'shimcha vakolat berilmagan</span>
        ) : (
          enabled.map((d) => {
            const Icon = d.icon
            return (
              <span key={d.key} className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2.5 py-1 text-[11px] font-bold text-brand-primary">
                <Icon size={12} />
                {d.short}
              </span>
            )
          })
        )}
      </div>
      {open && <PermissionsDialog employee={employee} onClose={() => setOpen(false)} />}
    </section>
  )
}

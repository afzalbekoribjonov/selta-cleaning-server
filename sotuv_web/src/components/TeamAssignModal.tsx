import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { listEmployeesByDepartment, type EmployeeSummaryFull } from '@/lib/employees'
import { assignTeam } from '@/lib/orders-api'
import { describeApiError } from '@/lib/api'

interface Candidate {
  employee: EmployeeSummaryFull
  departmentLabel: string
}

export function TeamAssignModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listEmployeesByDepartment('worker'), listEmployeesByDepartment('delivery')])
      .then(([workers, delivery]) => {
        setCandidates([
          ...workers.map((e) => ({ employee: e, departmentLabel: 'Ishchi' })),
          ...delivery.map((e) => ({ employee: e, departmentLabel: 'Dastavchik' })),
        ])
      })
      .catch((e) => setLoadError(describeApiError(e)))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (selected.size === 0) {
      setError('Kamida bitta xodim tanlang')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await assignTeam(orderId, Array.from(selected))
      onClose()
    } catch (e) {
      setError(describeApiError(e))
      setSaving(false)
    }
  }

  const grouped = new Map<string, Candidate[]>()
  for (const c of candidates ?? []) {
    const list = grouped.get(c.departmentLabel) ?? []
    list.push(c)
    grouped.set(c.departmentLabel, list)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-extrabold text-ink">Jamoa biriktirish</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-dark hover:bg-bg">
            <X size={18} />
          </button>
        </div>

        {loadError ? (
          <p className="py-6 text-center text-sm font-semibold text-danger">{loadError}</p>
        ) : candidates === null ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary/25 border-t-brand-primary" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-dark">Ishchi yoki dastavchik bo'limida xodim yo'q</p>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([label, list]) => (
              <div key={label}>
                <p className="mb-2 text-xs font-extrabold text-brand-primary">{label}</p>
                <div className="space-y-1.5">
                  {list.map((c) => (
                    <label
                      key={c.employee.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-bg"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.employee.id)}
                        onChange={() => toggle(c.employee.id)}
                        className="h-4 w-4 accent-brand-primary"
                      />
                      <span className="text-sm font-bold text-ink">{c.employee.fullName}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

        <button
          onClick={submit}
          disabled={saving || candidates === null || candidates.length === 0}
          className="mt-5 w-full rounded-xl bg-brand-primary py-3 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {saving ? 'Biriktirilmoqda...' : 'BIRIKTIRISH'}
        </button>
      </div>
    </div>
  )
}

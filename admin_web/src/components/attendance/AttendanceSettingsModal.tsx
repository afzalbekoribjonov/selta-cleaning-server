import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Users, Save, Check, X, Settings2, SlidersHorizontal } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Employee } from '@/lib/employees'
import { DEFAULT_WORK_DAYS, UZ_WEEKDAY_SHORT, type AttendanceConfig } from '@/lib/attendance'
import { LocationPickerModal } from '@/components/attendance/LocationPickerModal'
import { Spinner } from '@/components/ui/Spinner'
import { useEscapeClose } from '@/hooks/useEscapeClose'

type Tab = 'rules' | 'employees'

/**
 * Davomat sozlamalari — qoidalar va kuzatiladigan xodimlar.
 *
 * Avval ikkalasi ham sahifaning o'zida, yig'iladigan bo'limlar sifatida
 * turardi va asosiy narsani — davomat jadvalini — pastga surib qo'yardi.
 * Endi ular shu modal oyna ichida: sahifada faqat jadval qoladi (talab).
 */
export function AttendanceSettingsModal({
  config,
  loading,
  onClose,
}: {
  config: AttendanceConfig
  loading: boolean
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const [tab, setTab] = useState<Tab>('rules')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
          <Settings2 size={20} className="shrink-0 text-brand-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-extrabold text-ink">Davomat sozlamalari</h2>
            <p className="truncate text-xs text-gray-dark">Qoidalar va kuzatiladigan xodimlar</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-dark hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </header>

        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="flex rounded-xl border border-border bg-bg p-1">
            {(
              [
                { id: 'rules', label: 'Qoidalar', icon: SlidersHorizontal },
                { id: 'employees', label: 'Xodimlar', icon: Users },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  tab === id ? 'bg-brand-primary text-white' : 'text-ink/70'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {tab === 'rules' ? (
            // Sozlamalar yuklanmaguncha forma ochilmaydi: RulesTab boshlang'ich
            // qiymatlarni faqat bir marta, o'rnatilganda oladi.
            loading ? (
              <Spinner className="py-10" />
            ) : (
              <RulesTab config={config} />
            )
          ) : (
            <EmployeesTab />
          )}
        </div>
      </div>
    </div>
  )
}

function RulesTab({ config }: { config: AttendanceConfig }) {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(config.enabled)
  const [arrivalTime, setArrivalTime] = useState(config.arrivalTime)
  const [lateToleranceMinutes, setLateToleranceMinutes] = useState(String(config.lateToleranceMinutes))
  const [radiusMeters, setRadiusMeters] = useState(String(config.radiusMeters))
  const [workDays, setWorkDays] = useState<number[]>(config.workDays ?? DEFAULT_WORK_DAYS)
  const [location, setLocation] = useState(config.location)
  const [mapOpen, setMapOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/adminSetAttendanceConfig', {
        enabled,
        arrivalTime,
        lateToleranceMinutes: Number(lateToleranceMinutes) || 30,
        location,
        radiusMeters: Number(radiusMeters) || 200,
        workDays,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  const deadlineLabel = (() => {
    const [h, m] = arrivalTime.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    const total = h * 60 + m + (Number(lateToleranceMinutes) || 0)
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })()

  function handleSave() {
    if (!location) {
      setError('Ishxona joylashuvini belgilang — "Xaritada belgilash" tugmasi orqali')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-brand-primary"
        />
        <div>
          <div className="text-sm font-bold text-ink">Davomat nazorati yoqilgan</div>
          <div className="text-xs text-gray-dark">O'chirilsa, hech kimning davomati tekshirilmaydi</div>
        </div>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Ish boshlanish vaqti">
          <input
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-primary"
          />
        </Field>
        <Field label="Imtiyoz muddati (daqiqa)" hint={deadlineLabel ? `${deadlineLabel} gacha — "Vaqtida"` : undefined}>
          <input
            type="number"
            min={1}
            max={240}
            value={lateToleranceMinutes}
            onChange={(e) => setLateToleranceMinutes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-primary"
          />
        </Field>
        <Field label="Radius (metr)" hint="Ishxonadan shu masofagacha kelsa hisobga olinadi">
          <input
            type="number"
            min={10}
            max={5000}
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-primary"
          />
        </Field>
      </div>

      <Field label="Ish kunlari" hint='Belgilanmagan kunlar "Dam olish" — hech qachon "Kelmagan" deb hisoblanmaydi'>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const active = workDays.includes(d)
            return (
              <button
                key={d}
                onClick={() => setWorkDays((prev) => (active ? prev.filter((x) => x !== d) : [...prev, d].sort()))}
                className={`h-10 min-w-[52px] rounded-xl px-3 text-xs font-bold transition-colors ${
                  active ? 'bg-brand-primary text-white' : 'border border-border bg-bg text-ink/70'
                }`}
              >
                {UZ_WEEKDAY_SHORT[d]}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Ishxona joylashuvi">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
          <MapPin size={18} className={location ? 'text-brand-primary' : 'text-gray'} />
          <div className="min-w-0 flex-1">
            {location ? (
              <span className="font-mono text-sm text-ink">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </span>
            ) : (
              <span className="text-sm text-gray-dark">Hali belgilanmagan</span>
            )}
          </div>
          <button
            onClick={() => setMapOpen(true)}
            className="rounded-xl border border-brand-primary px-4 py-2 text-xs font-bold text-brand-primary hover:bg-brand-primary/5"
          >
            {location ? "Xaritada o'zgartirish" : 'Xaritada belgilash'}
          </button>
        </div>
      </Field>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <button
        onClick={handleSave}
        disabled={mutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60 sm:w-auto"
      >
        {saved ? <Check size={16} /> : <Save size={16} />}
        {mutation.isPending ? 'Saqlanmoqda...' : saved ? 'Saqlandi' : 'Saqlash'}
      </button>

      {mapOpen && (
        <LocationPickerModal
          initial={location}
          radiusMeters={Number(radiusMeters) || 200}
          onApply={setLocation}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  )
}

function EmployeesTab() {
  const queryClient = useQueryClient()
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiPost<{ employees: Employee[] }>('/adminListEmployees'),
  })
  const mutation = useMutation({
    mutationFn: ({ employeeId, attendanceEnabled }: { employeeId: string; attendanceEnabled: boolean }) =>
      apiPost('/adminSetEmployeeAttendance', { employeeId, attendanceEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })

  if (employeesQuery.isLoading) return <Spinner className="py-10" />

  const employees = (employeesQuery.data?.employees ?? []).filter((e) => e.status === 'active')
  const enrolledCount = employees.filter((e) => e.attendanceEnabled).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-dark">
        <strong className="text-ink">{enrolledCount}</strong> ta xodim davomat nazoratida. Belgilanmagan xodimlar
        jadvalda umuman ko'rinmaydi.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {employees.map((emp) => (
          <label
            key={emp.id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
              emp.attendanceEnabled ? 'border-brand-primary/40 bg-brand-primary/5' : 'border-border bg-bg'
            }`}
          >
            <input
              type="checkbox"
              checked={emp.attendanceEnabled}
              onChange={(e) => mutation.mutate({ employeeId: emp.id, attendanceEnabled: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-brand-primary"
            />
            <span className="truncate text-sm font-semibold text-ink">{emp.fullName}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      {hint && <p className="mb-2 text-xs text-gray-dark">{hint}</p>}
      {children}
    </div>
  )
}

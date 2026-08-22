import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, MapPin, Users, Save, Check } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Employee } from '@/lib/employees'
import { useAttendanceConfig } from '@/hooks/useAttendanceConfig'
import {
  subscribeAttendanceRecords,
  toDateKey,
  addDays,
  startOfIsoWeek,
  startOfMonth,
  daysInMonth,
  UZ_WEEKDAY_SHORT,
  type AttendanceRecord,
  type AttendanceConfig,
} from '@/lib/attendance'
import { LocationMapPicker } from '@/components/attendance/LocationMapPicker'
import { Spinner } from '@/components/ui/Spinner'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'

type RangeMode = 'day' | 'week' | 'month'
type CellStatus = 'on_time' | 'late' | 'absent' | 'pending' | 'not_enrolled'

const CELL_CONFIG: Record<CellStatus, { label: string; className: string }> = {
  on_time: { label: 'Vaqtida', className: 'bg-success-bg text-success' },
  late: { label: 'Kechikkan', className: 'bg-warning-bg text-warning' },
  absent: { label: 'Kelmagan', className: 'bg-danger-bg text-danger' },
  pending: { label: '—', className: 'text-gray-dark' },
  not_enrolled: { label: '', className: '' },
}

function computeCellStatus(
  employee: Employee,
  dateKey: string,
  record: AttendanceRecord | undefined,
  config: AttendanceConfig,
  todayKey: string,
): CellStatus {
  if (record) return record.status
  if (employee.attendanceEnabledAt) {
    const enabledDateKey = toDateKey(new Date(employee.attendanceEnabledAt))
    if (dateKey < enabledDateKey) return 'not_enrolled'
  }
  if (dateKey > todayKey) return 'not_enrolled'
  if (dateKey < todayKey) return 'absent'
  if (!config.enabled) return 'not_enrolled'
  const [h, m] = config.arrivalTime.split(':').map(Number)
  const windowEnd = h * 60 + m + config.lateToleranceMinutes
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes < windowEnd ? 'pending' : 'absent'
}

/**
 * Talab: "Davomat nazorati" — xodimlarning ishga kelishini GPS orqali
 * tekshirish. Ilova ochilganda avtomatik (talab bo'yicha tanlangan
 * yondashuv) joylashuv yuboriladi, bu yerda esa admin qoidalarni
 * (vaqt/joylashuv/radius) sozlaydi, kimlar tekshirilishini belgilaydi,
 * va natijalarni exel ko'rinishidagi jadvalda ko'radi.
 */
export default function AttendancePage() {
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiPost<{ employees: Employee[] }>('/adminListEmployees'),
  })
  const activeEmployees = (employeesQuery.data?.employees ?? []).filter((e) => e.status === 'active')
  const enrolledEmployees = activeEmployees.filter((e) => e.attendanceEnabled)

  const { config, loading: configLoading } = useAttendanceConfig()

  const [rangeMode, setRangeMode] = useState<RangeMode>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())

  const { start, end, days } = useMemo(() => {
    if (rangeMode === 'day') return { start: anchorDate, end: anchorDate, days: [anchorDate] }
    if (rangeMode === 'week') {
      const s = startOfIsoWeek(anchorDate)
      const d = Array.from({ length: 7 }, (_, i) => addDays(s, i))
      return { start: s, end: d[6], days: d }
    }
    const s = startOfMonth(anchorDate)
    const d = Array.from({ length: daysInMonth(anchorDate) }, (_, i) => addDays(s, i))
    return { start: s, end: d[d.length - 1], days: d }
  }, [rangeMode, anchorDate])

  const startKey = toDateKey(start)
  const endKey = toDateKey(end)

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  useEffect(() => {
    setRecordsLoading(true)
    return subscribeAttendanceRecords(startKey, endKey, (recs) => {
      setRecords(recs)
      setRecordsLoading(false)
    })
  }, [startKey, endKey])

  const recordsByKey = useMemo(() => {
    const map: Record<string, AttendanceRecord> = {}
    for (const r of records) map[`${r.employeeId}_${r.date}`] = r
    return map
  }, [records])

  const todayKey = toDateKey(new Date())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Davomat nazorati</h1>
        <p className="mt-1 text-sm text-gray-dark">Xodimlarning ishga kelishini GPS orqali avtomatik tekshirish</p>
      </div>

      <AttendanceConfigSection config={config} loading={configLoading} />

      <EnrollmentSection employees={activeEmployees} loading={employeesQuery.isLoading} />

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarCheck size={18} className="text-brand-primary" />
            <h2 className="font-heading font-bold text-ink">Davomat jadvali</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-border bg-bg p-1">
              {(['day', 'week', 'month'] as RangeMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setRangeMode(m)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    rangeMode === m ? 'bg-brand-primary text-white' : 'text-ink/70'
                  }`}
                >
                  {m === 'day' ? 'Kunlik' : m === 'week' ? 'Haftalik' : 'Oylik'}
                </button>
              ))}
            </div>
            {rangeMode === 'day' && (
              <input
                type="date"
                value={toDateKey(anchorDate)}
                onChange={(e) => setAnchorDate(new Date(e.target.value))}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            )}
            {rangeMode === 'week' && (
              <input
                type="date"
                value={toDateKey(anchorDate)}
                onChange={(e) => setAnchorDate(new Date(e.target.value))}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            )}
            {rangeMode === 'month' && (
              <input
                type="month"
                value={`${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  setAnchorDate(new Date(y, m - 1, 1))
                }}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            )}
          </div>
        </div>

        {rangeMode === 'week' && (
          <p className="px-5 pt-3 text-xs text-gray-dark">
            {days[0].getDate()} {UZ_MONTHS_FULL[days[0].getMonth()]} – {days[6].getDate()}{' '}
            {UZ_MONTHS_FULL[days[6].getMonth()]}
          </p>
        )}
        {rangeMode === 'month' && (
          <p className="px-5 pt-3 text-xs text-gray-dark">
            {UZ_MONTHS_FULL[anchorDate.getMonth()]} {anchorDate.getFullYear()}
          </p>
        )}

        {employeesQuery.isLoading || recordsLoading ? (
          <Spinner className="p-8" />
        ) : enrolledEmployees.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Users className="text-gray" size={40} />
            <p className="font-semibold text-ink">Hali davomatga xodim belgilanmagan</p>
            <p className="text-sm text-gray-dark">Yuqoridagi "Kuzatiladigan xodimlar" bo'limidan belgilang</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-gray-dark">
                  <th className="sticky left-0 z-10 bg-surface px-5 py-3 font-semibold">Xodim</th>
                  {days.map((d) => (
                    <th key={toDateKey(d)} className="whitespace-nowrap px-3 py-3 text-center font-semibold">
                      <div>{UZ_WEEKDAY_SHORT[d.getDay()]}</div>
                      <div className="text-ink">{d.getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrolledEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-surface px-5 py-3 font-semibold text-ink">{emp.fullName}</td>
                    {days.map((d) => {
                      const dateKey = toDateKey(d)
                      const record = recordsByKey[`${emp.id}_${dateKey}`]
                      const status = computeCellStatus(emp, dateKey, record, config, todayKey)
                      const cell = CELL_CONFIG[status]
                      return (
                        <td key={dateKey} className="px-3 py-3 text-center">
                          {cell.label && (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cell.className}`}
                              title={record?.distanceMeters != null ? `${record.distanceMeters} m masofada` : undefined}
                            >
                              {cell.label}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function AttendanceConfigSection({ config, loading }: { config: AttendanceConfig; loading: boolean }) {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [arrivalTime, setArrivalTime] = useState('08:00')
  const [lateToleranceMinutes, setLateToleranceMinutes] = useState('30')
  const [radiusMeters, setRadiusMeters] = useState('200')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!initialized && !loading) {
    setEnabled(config.enabled)
    setArrivalTime(config.arrivalTime)
    setLateToleranceMinutes(String(config.lateToleranceMinutes))
    setRadiusMeters(String(config.radiusMeters))
    setLocation(config.location)
    setInitialized(true)
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/adminSetAttendanceConfig', {
        enabled,
        arrivalTime,
        lateToleranceMinutes: Number(lateToleranceMinutes) || 30,
        location,
        radiusMeters: Number(radiusMeters) || 200,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi'),
  })

  function handleSave() {
    if (!location) {
      setError('Ishxona joylashuvini xaritada belgilang')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <MapPin size={18} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Davomat qoidalari</h2>
      </div>
      <p className="mb-4 text-xs text-gray-dark">Ishga kelish vaqti, kechikish chegarasi va ishxona joylashuvi — barcha kuzatiladigan xodimlar uchun bir xil</p>

      {loading ? (
        <Spinner className="py-8" />
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            <div>
              <div className="text-sm font-bold text-ink">Davomat nazorati yoqilgan</div>
              <div className="text-xs text-gray-dark">O'chirilsa, hech kimning davomati tekshirilmaydi</div>
            </div>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Ishga kelish vaqti</label>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Kechikish chegarasi (daqiqa)</label>
              <input
                type="number"
                min={1}
                max={240}
                value={lateToleranceMinutes}
                onChange={(e) => setLateToleranceMinutes(e.target.value)}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
              <p className="mt-1 text-xs text-gray-dark">Shu vaqtgacha kelsa "kechikkan", undan keyin "kelmagan"</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Radius (metr)</label>
              <input
                type="number"
                min={10}
                max={5000}
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(e.target.value)}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Ishxona joylashuvi</label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                placeholder="Kenglik (lat)"
                value={location?.lat ?? ''}
                onChange={(e) => setLocation((prev) => ({ lat: Number(e.target.value), lng: prev?.lng ?? 0 }))}
                className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
              <input
                type="number"
                step="any"
                placeholder="Uzunlik (lng)"
                value={location?.lng ?? ''}
                onChange={(e) => setLocation((prev) => ({ lat: prev?.lat ?? 0, lng: Number(e.target.value) }))}
                className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
            <LocationMapPicker value={location} onChange={setLocation} radiusMeters={Number(radiusMeters) || 200} />
          </div>

          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {mutation.isPending ? 'Saqlanmoqda...' : saved ? 'Saqlandi' : 'Saqlash'}
          </button>
        </div>
      )}
    </section>
  )
}

function EnrollmentSection({ employees, loading }: { employees: Employee[]; loading: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: ({ employeeId, attendanceEnabled }: { employeeId: string; attendanceEnabled: boolean }) =>
      apiPost('/adminSetEmployeeAttendance', { employeeId, attendanceEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })

  const enrolledCount = employees.filter((e) => e.attendanceEnabled).length

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Kuzatiladigan xodimlar</h2>
        </div>
        <span className="text-xs font-semibold text-gray-dark">{open ? 'Yopish' : `${enrolledCount} ta belgilangan — ko'rsatish`}</span>
      </button>

      {open &&
        (loading ? (
          <Spinner className="py-8" />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {employees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3">
                <input
                  type="checkbox"
                  checked={emp.attendanceEnabled}
                  onChange={(e) => mutation.mutate({ employeeId: emp.id, attendanceEnabled: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="truncate text-sm font-semibold text-ink">{emp.fullName}</span>
              </label>
            ))}
          </div>
        ))}
    </section>
  )
}

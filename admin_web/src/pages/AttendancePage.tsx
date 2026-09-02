import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck,
  MapPin,
  Users,
  Save,
  Check,
  Settings2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { type Employee } from '@/lib/employees'
import { useAttendanceConfig } from '@/hooks/useAttendanceConfig'
import {
  subscribeAttendanceRecords,
  subscribeAttendanceIssues,
  businessDateKey,
  businessMinutesNow,
  toDateKey,
  addDays,
  startOfIsoWeek,
  startOfMonth,
  daysInMonth,
  UZ_WEEKDAY_SHORT,
  UZ_WEEKDAY_FULL,
  ISSUE_LABELS,
  DEFAULT_WORK_DAYS,
  type AttendanceRecord,
  type AttendanceIssue,
  type AttendanceConfig,
} from '@/lib/attendance'
import { LocationPickerModal } from '@/components/attendance/LocationPickerModal'
import { Spinner } from '@/components/ui/Spinner'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'

type RangeMode = 'day' | 'week' | 'month'
type CellStatus = 'on_time' | 'late' | 'absent' | 'pending' | 'day_off' | 'gps_issue' | 'not_tracked' | 'future'

const CELL_CONFIG: Record<CellStatus, { label: string; short: string; className: string }> = {
  on_time: { label: 'Vaqtida', short: 'Vaqtida', className: 'bg-success-bg text-success' },
  late: { label: 'Kechikkan', short: 'Kechikkan', className: 'bg-warning-bg text-warning' },
  absent: { label: 'Kelmagan', short: 'Kelmagan', className: 'bg-danger-bg text-danger' },
  pending: { label: 'Kutilmoqda', short: 'Kutilmoqda', className: 'bg-bg text-gray-dark' },
  day_off: { label: 'Dam olish', short: '·', className: 'text-gray' },
  gps_issue: { label: 'GPS yo\'q', short: 'GPS yo\'q', className: 'bg-info-bg text-info' },
  not_tracked: { label: 'Kuzatilmagan', short: '', className: '' },
  future: { label: '', short: '', className: '' },
}

/**
 * Bitta katakning holati.
 *
 * Tartib MUHIM va 2026-09-03 da tuzatilgan — avval `dateKey < todayKey`
 * tekshiruvi `config.enabled` dan OLDIN turgani uchun, davomat nazorati
 * umuman o'chirilgan bo'lsa ham o'tgan kunlar "Kelmagan" bo'lib
 * ko'rinardi. Shuningdek dam olish kunlari va GPS muammosi tushunchasi
 * umuman yo'q edi, shuning uchun oylik jadval butunlay qizil chiqardi.
 */
function computeCellStatus(args: {
  employee: Employee
  dateKey: string
  weekday: number
  record: AttendanceRecord | undefined
  hasIssue: boolean
  config: AttendanceConfig
  todayKey: string
}): CellStatus {
  const { employee, dateKey, weekday, record, hasIssue, config, todayKey } = args

  // Haqiqiy yozuv har doim ustun — nazorat keyinchalik o'chirilgan bo'lsa ham.
  if (record) return record.status
  if (dateKey > todayKey) return 'future'

  // Nazorat qachondan boshlangani: global yoqilgan sana VA shu xodim
  // kiritilgan sana — ikkalasining kechrog'i. Ikkalasi ham noma'lum
  // bo'lsa, o'tmishga nisbatan hech qanday da'vo qilinmaydi.
  const employeeStart = employee.attendanceEnabledAt ? businessDateKey(new Date(employee.attendanceEnabledAt)) : null
  const configStart = config.enabledAt ? businessDateKey(config.enabledAt) : null
  const trackingStart = [employeeStart, configStart].filter(Boolean).sort().pop() ?? null
  if (!trackingStart || dateKey < trackingStart) return 'not_tracked'

  // Nazorat hozir o'chirilgan bo'lsa, yozuvsiz kunlarni "kelmagan" deb
  // ayblamaymiz — u kunlarda tizim ishlaganiga kafolat yo'q.
  if (!config.enabled) return 'not_tracked'

  if (!config.workDays.includes(weekday)) return 'day_off'
  if (hasIssue) return 'gps_issue'

  if (dateKey === todayKey) {
    const [h, m] = config.arrivalTime.split(':').map(Number)
    const deadline = h * 60 + m + config.lateToleranceMinutes
    if (businessMinutesNow() <= deadline) return 'pending'
  }
  return 'absent'
}

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
  const [issues, setIssues] = useState<AttendanceIssue[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)

  useEffect(() => {
    setRecordsLoading(true)
    const unsubRecords = subscribeAttendanceRecords(startKey, endKey, (recs) => {
      setRecords(recs)
      setRecordsLoading(false)
    })
    const unsubIssues = subscribeAttendanceIssues(startKey, endKey, setIssues)
    return () => {
      unsubRecords()
      unsubIssues()
    }
  }, [startKey, endKey])

  const recordsByKey = useMemo(() => {
    const map: Record<string, AttendanceRecord> = {}
    for (const r of records) map[`${r.employeeId}_${r.date}`] = r
    return map
  }, [records])

  const issueKeys = useMemo(() => new Set(issues.map((i) => `${i.employeeId}_${i.date}`)), [issues])

  const todayKey = businessDateKey(new Date())

  // Bugungi xulosa — sahifaning eng tepasida, admin bir qarashda holatni
  // tushunishi uchun.
  const todaySummary = useMemo(() => {
    const counts = { on_time: 0, late: 0, absent: 0, pending: 0, gps_issue: 0 }
    if (!config.enabled) return counts
    const weekday = new Date().getDay()
    for (const emp of enrolledEmployees) {
      const status = computeCellStatus({
        employee: emp,
        dateKey: todayKey,
        weekday,
        record: recordsByKey[`${emp.id}_${todayKey}`],
        hasIssue: issueKeys.has(`${emp.id}_${todayKey}`),
        config,
        todayKey,
      })
      if (status in counts) counts[status as keyof typeof counts] += 1
    }
    return counts
  }, [enrolledEmployees, recordsByKey, issueKeys, config, todayKey])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Davomat nazorati</h1>
          <p className="mt-1 text-sm text-gray-dark">Xodimlarning ishga kelishini GPS orqali avtomatik tekshirish</p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
            config.enabled ? 'bg-success-bg text-success' : 'bg-bg text-gray-dark'
          }`}
        >
          {config.enabled ? 'Yoqilgan' : "O'chirilgan"}
        </span>
      </div>

      {config.enabled && enrolledEmployees.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile icon={Check} label="Vaqtida" value={todaySummary.on_time} tone="success" />
          <SummaryTile icon={Clock} label="Kechikkan" value={todaySummary.late} tone="warning" />
          <SummaryTile icon={AlertTriangle} label="Kelmagan" value={todaySummary.absent} tone="danger" />
          <SummaryTile icon={CircleSlash} label="Kutilmoqda" value={todaySummary.pending} tone="muted" />
        </div>
      )}

      <AttendanceConfigSection config={config} loading={configLoading} />

      <EnrollmentSection employees={activeEmployees} loading={employeesQuery.isLoading} />

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarCheck size={18} className="text-brand-primary" />
            <div>
              <h2 className="font-heading font-bold text-ink">Davomat jadvali</h2>
              <p className="text-xs text-gray-dark">
                {rangeMode === 'day' && `${days[0].getDate()}-${UZ_MONTHS_FULL[days[0].getMonth()]}, ${UZ_WEEKDAY_FULL[days[0].getDay()]}`}
                {rangeMode === 'week' &&
                  `${days[0].getDate()} ${UZ_MONTHS_FULL[days[0].getMonth()]} – ${days[6].getDate()} ${UZ_MONTHS_FULL[days[6].getMonth()]}`}
                {rangeMode === 'month' && `${UZ_MONTHS_FULL[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`}
              </p>
            </div>
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
            {rangeMode === 'month' ? (
              <input
                type="month"
                value={`${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  setAnchorDate(new Date(y, m - 1, 1))
                }}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            ) : (
              <input
                type="date"
                value={toDateKey(anchorDate)}
                onChange={(e) => setAnchorDate(new Date(e.target.value))}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border bg-bg/40 px-5 py-2.5">
          {(['on_time', 'late', 'absent', 'pending', 'gps_issue', 'day_off'] as CellStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-dark">
              <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT[s]}`} />
              {CELL_CONFIG[s].label}
            </span>
          ))}
        </div>

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
                  {days.map((d) => {
                    const isRest = !config.workDays.includes(d.getDay())
                    const isToday = toDateKey(d) === todayKey
                    return (
                      <th
                        key={toDateKey(d)}
                        className={`whitespace-nowrap px-3 py-3 text-center font-semibold ${isRest ? 'bg-bg/60' : ''}`}
                      >
                        <div className={isToday ? 'text-brand-primary' : ''}>{UZ_WEEKDAY_SHORT[d.getDay()]}</div>
                        <div className={isToday ? 'font-extrabold text-brand-primary' : 'text-ink'}>{d.getDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {enrolledEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-surface px-5 py-3 font-semibold text-ink">{emp.fullName}</td>
                    {days.map((d) => {
                      const dateKey = toDateKey(d)
                      const record = recordsByKey[`${emp.id}_${dateKey}`]
                      const hasIssue = issueKeys.has(`${emp.id}_${dateKey}`)
                      const status = computeCellStatus({
                        employee: emp,
                        dateKey,
                        weekday: d.getDay(),
                        record,
                        hasIssue,
                        config,
                        todayKey,
                      })
                      const cell = CELL_CONFIG[status]
                      const title = record
                        ? [
                            record.checkedInTime ? `Belgilandi: ${record.checkedInTime}` : null,
                            record.distanceMeters != null ? `${record.distanceMeters} m masofada` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : status === 'gps_issue'
                          ? ISSUE_LABELS.unknown
                          : undefined
                      return (
                        <td key={dateKey} className={`px-3 py-3 text-center ${status === 'day_off' ? 'bg-bg/60' : ''}`}>
                          {cell.short && (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cell.className}`}
                              title={title}
                            >
                              {cell.short}
                            </span>
                          )}
                          {record?.checkedInTime && status !== 'day_off' && (
                            <div className="mt-0.5 text-[10px] font-semibold text-gray-dark">{record.checkedInTime}</div>
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

const LEGEND_DOT: Record<string, string> = {
  on_time: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-danger',
  pending: 'bg-gray',
  gps_issue: 'bg-info',
  day_off: 'bg-border',
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Check
  label: string
  value: number
  tone: 'success' | 'warning' | 'danger' | 'muted'
}) {
  const tones = {
    success: 'text-success bg-success-bg',
    warning: 'text-warning bg-warning-bg',
    danger: 'text-danger bg-danger-bg',
    muted: 'text-gray-dark bg-bg',
  }
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-extrabold text-ink">{value}</div>
      <div className="text-xs font-semibold text-gray-dark">{label}</div>
    </div>
  )
}

function AttendanceConfigSection({ config, loading }: { config: AttendanceConfig; loading: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [arrivalTime, setArrivalTime] = useState('08:00')
  const [lateToleranceMinutes, setLateToleranceMinutes] = useState('30')
  const [radiusMeters, setRadiusMeters] = useState('200')
  const [workDays, setWorkDays] = useState<number[]>(DEFAULT_WORK_DAYS)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!initialized && !loading) {
    setEnabled(config.enabled)
    setArrivalTime(config.arrivalTime)
    setLateToleranceMinutes(String(config.lateToleranceMinutes))
    setRadiusMeters(String(config.radiusMeters))
    setWorkDays(config.workDays)
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

  function handleSave() {
    if (!location) {
      setError("Ishxona joylashuvini belgilang — \"Xaritada belgilash\" tugmasi orqali")
      return
    }
    setError(null)
    mutation.mutate()
  }

  const deadlineLabel = (() => {
    const [h, m] = arrivalTime.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    const total = h * 60 + m + (Number(lateToleranceMinutes) || 0)
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })()

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-4 text-left">
        <Settings2 size={18} className="text-brand-primary" />
        <div className="flex-1">
          <h2 className="font-heading font-bold text-ink">Davomat qoidalari</h2>
          <p className="text-xs text-gray-dark">
            {loading
              ? '...'
              : `Ish boshlanishi ${config.arrivalTime} · ${config.lateToleranceMinutes} daqiqa imtiyoz · ${config.radiusMeters} m radius`}
          </p>
        </div>
        {open ? <ChevronDown size={18} className="text-gray-dark" /> : <ChevronRight size={18} className="text-gray-dark" />}
      </button>

      {open &&
        (loading ? (
          <Spinner className="py-8" />
        ) : (
          <div className="space-y-5 border-t border-border p-5">
            <label className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
              <div>
                <div className="text-sm font-bold text-ink">Davomat nazorati yoqilgan</div>
                <div className="text-xs text-gray-dark">O'chirilsa, hech kimning davomati tekshirilmaydi</div>
              </div>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Ish boshlanish vaqti</label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Imtiyoz muddati (daqiqa)</label>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={lateToleranceMinutes}
                  onChange={(e) => setLateToleranceMinutes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
                {deadlineLabel && (
                  <p className="mt-1 text-xs text-gray-dark">
                    <strong className="text-ink">{deadlineLabel}</strong> gacha kelgan — "Vaqtida", keyin — "Kechikkan"
                  </p>
                )}
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
                <p className="mt-1 text-xs text-gray-dark">Ishxonadan shu masofagacha kelsa hisobga olinadi</p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Ish kunlari</label>
              <p className="mb-2 text-xs text-gray-dark">Belgilanmagan kunlar "Dam olish" sifatida ko'rsatiladi va hech qachon "Kelmagan" deb hisoblanmaydi</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const active = workDays.includes(d)
                  return (
                    <button
                      key={d}
                      onClick={() => setWorkDays((prev) => (active ? prev.filter((x) => x !== d) : [...prev, d].sort()))}
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                        active ? 'bg-brand-primary text-white' : 'border border-border bg-bg text-ink/70'
                      }`}
                    >
                      {UZ_WEEKDAY_SHORT[d]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">Ishxona joylashuvi</label>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-3.5">
                <MapPin size={18} className={location ? 'text-brand-primary' : 'text-gray'} />
                <div className="flex-1">
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
        ))}

      {mapOpen && (
        <LocationPickerModal
          initial={location}
          radiusMeters={Number(radiusMeters) || 200}
          onApply={setLocation}
          onClose={() => setMapOpen(false)}
        />
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
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-4 text-left">
        <Users size={18} className="text-brand-primary" />
        <div className="flex-1">
          <h2 className="font-heading font-bold text-ink">Kuzatiladigan xodimlar</h2>
          <p className="text-xs text-gray-dark">{enrolledCount} ta xodim davomat nazoratida</p>
        </div>
        {open ? <ChevronDown size={18} className="text-gray-dark" /> : <ChevronRight size={18} className="text-gray-dark" />}
      </button>

      {open &&
        (loading ? (
          <Spinner className="py-8" />
        ) : (
          <div className="grid grid-cols-1 gap-2 border-t border-border p-5 sm:grid-cols-2 xl:grid-cols-3">
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
                  className="h-4 w-4 accent-brand-primary"
                />
                <span className="truncate text-sm font-semibold text-ink">{emp.fullName}</span>
              </label>
            ))}
          </div>
        ))}
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Users, Settings2, CircleSlash, Clock, AlertTriangle, Check } from 'lucide-react'
import { apiPost } from '@/lib/api'
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
  type AttendanceRecord,
  type AttendanceIssue,
  type AttendanceConfig,
} from '@/lib/attendance'
import { AttendanceSettingsModal } from '@/components/attendance/AttendanceSettingsModal'
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
  gps_issue: { label: "GPS yo'q", short: "GPS yo'q", className: 'bg-info-bg text-info' },
  not_tracked: { label: 'Kuzatilmagan', short: '', className: '' },
  future: { label: '', short: '', className: '' },
}

const LEGEND_DOT: Record<string, string> = {
  on_time: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-danger',
  pending: 'bg-gray',
  gps_issue: 'bg-info',
  day_off: 'bg-border',
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
  // useMemo shart: bu ro'yxat quyidagi `todaySummary` ning bog'liqligi —
  // har renderda yangi massiv bo'lsa, u hech qachon keshlanmaydi.
  const enrolledEmployees = useMemo(
    () => (employeesQuery.data?.employees ?? []).filter((e) => e.status === 'active' && e.attendanceEnabled),
    [employeesQuery.data],
  )

  const { config, loading: configLoading } = useAttendanceConfig()

  const [settingsOpen, setSettingsOpen] = useState(false)
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

  /** Bitta xodim + bitta kun uchun katak holati — jadval va ro'yxat bir manbadan. */
  const statusOf = (emp: Employee, day: Date) => {
    const dateKey = toDateKey(day)
    return computeCellStatus({
      employee: emp,
      dateKey,
      weekday: day.getDay(),
      record: recordsByKey[`${emp.id}_${dateKey}`],
      hasIssue: issueKeys.has(`${emp.id}_${dateKey}`),
      config,
      todayKey,
    })
  }

  // Bugungi xulosa — sahifaning eng tepasida, admin bir qarashda holatni
  // tushunishi uchun.
  const todaySummary = useMemo(() => {
    const counts = { on_time: 0, late: 0, absent: 0, pending: 0, gps_issue: 0 }
    if (!config.enabled) return counts
    const today = new Date()
    for (const emp of enrolledEmployees) {
      const status = statusOf(emp, today)
      if (status in counts) counts[status as keyof typeof counts] += 1
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolledEmployees, recordsByKey, issueKeys, config, todayKey])

  const rangeLabel =
    rangeMode === 'day'
      ? `${days[0].getDate()}-${UZ_MONTHS_FULL[days[0].getMonth()]}, ${UZ_WEEKDAY_FULL[days[0].getDay()]}`
      : rangeMode === 'week'
        ? `${days[0].getDate()} ${UZ_MONTHS_FULL[days[0].getMonth()]} – ${days[6].getDate()} ${UZ_MONTHS_FULL[days[6].getMonth()]}`
        : `${UZ_MONTHS_FULL[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`

  const loading = employeesQuery.isLoading || recordsLoading

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink">Davomat nazorati</h1>
          <p className="mt-1 text-sm text-gray-dark">Xodimlarning ishga kelishi GPS orqali avtomatik tekshiriladi</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
              config.enabled ? 'bg-success-bg text-success' : 'bg-bg text-gray-dark'
            }`}
          >
            {config.enabled ? 'Yoqilgan' : "O'chirilgan"}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-bold text-ink transition-colors hover:border-brand-primary hover:text-brand-primary"
          >
            <Settings2 size={16} />
            Sozlamalar
          </button>
        </div>
      </div>

      {config.enabled && enrolledEmployees.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile icon={Check} label="Vaqtida" value={todaySummary.on_time} tone="success" />
          <SummaryTile icon={Clock} label="Kechikkan" value={todaySummary.late} tone="warning" />
          <SummaryTile icon={AlertTriangle} label="Kelmagan" value={todaySummary.absent} tone="danger" />
          <SummaryTile icon={CircleSlash} label="Kutilmoqda" value={todaySummary.pending} tone="muted" />
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <CalendarCheck size={18} className="shrink-0 text-brand-primary" />
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-ink">Davomat jadvali</h2>
              <p className="truncate text-xs text-gray-dark">{rangeLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 rounded-xl border border-border bg-bg p-1 sm:flex-none">
              {(['day', 'week', 'month'] as RangeMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setRangeMode(m)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:flex-none ${
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
                  if (y && m) setAnchorDate(new Date(y, m - 1, 1))
                }}
                className="h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-primary sm:w-44"
              />
            ) : (
              <input
                type="date"
                value={toDateKey(anchorDate)}
                onChange={(e) => e.target.value && setAnchorDate(new Date(e.target.value))}
                className="h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm outline-none focus:border-brand-primary sm:w-44"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border bg-bg/40 px-4 py-2.5 sm:px-5">
          {(['on_time', 'late', 'absent', 'pending', 'gps_issue', 'day_off'] as CellStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-dark">
              <span className={`h-2.5 w-2.5 rounded-full ${LEGEND_DOT[s]}`} />
              {CELL_CONFIG[s].label}
            </span>
          ))}
        </div>

        {loading ? (
          <Spinner className="p-8" />
        ) : enrolledEmployees.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Users className="text-gray" size={40} />
            <p className="font-semibold text-ink">Hali davomatga xodim belgilanmagan</p>
            <p className="text-sm text-gray-dark">"Sozlamalar" → "Xodimlar" bo'limidan belgilang</p>
          </div>
        ) : (
          <>
            {/* Telefonda kunlik ko'rinish jadval emas, ro'yxat — bitta ustunli
                jadval gorizontal siljish talab qilib, o'qishni qiyinlashtirardi. */}
            {rangeMode === 'day' && (
              <ul className="divide-y divide-border sm:hidden">
                {enrolledEmployees.map((emp) => {
                  const status = statusOf(emp, days[0])
                  const record = recordsByKey[`${emp.id}_${toDateKey(days[0])}`]
                  const cell = CELL_CONFIG[status]
                  return (
                    <li key={emp.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-ink">{emp.fullName}</div>
                        {record?.checkedInTime && (
                          <div className="text-xs text-gray-dark">Belgilandi: {record.checkedInTime}</div>
                        )}
                      </div>
                      {cell.short && (
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${cell.className}`}>
                          {cell.label}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className={`overflow-x-auto ${rangeMode === 'day' ? 'hidden sm:block' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-gray-dark">
                    <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-semibold sm:px-5">Xodim</th>
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
                      <td className="sticky left-0 z-10 max-w-[9rem] truncate bg-surface px-4 py-3 font-semibold text-ink sm:max-w-none sm:px-5">
                        {emp.fullName}
                      </td>
                      {days.map((d) => {
                        const dateKey = toDateKey(d)
                        const record = recordsByKey[`${emp.id}_${dateKey}`]
                        const status = statusOf(emp, d)
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
                              <div className="mt-0.5 text-[10px] font-semibold text-gray-dark">
                                {record.checkedInTime}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {settingsOpen && (
        <AttendanceSettingsModal config={config} loading={configLoading} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
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

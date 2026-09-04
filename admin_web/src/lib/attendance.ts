import { collection, doc, onSnapshot, query, where, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

// Biznes vaqti yordamchilari `business-time.ts` da — ular davomatdan
// tashqari kunlik hisobot va buyurtma so'rovlarida ham ishlatiladi.
export { businessDateKey, businessMinutesNow } from './business-time'

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]

export interface AttendanceConfig {
  enabled: boolean
  arrivalTime: string // "08:00"
  lateToleranceMinutes: number
  location: { lat: number; lng: number } | null
  radiusMeters: number
  workDays: number[]
  enabledAt: Date | null
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  enabled: false,
  arrivalTime: '08:00',
  lateToleranceMinutes: 30,
  location: null,
  radiusMeters: 200,
  workDays: DEFAULT_WORK_DAYS,
  enabledAt: null,
}

export function subscribeAttendanceConfig(callback: (config: AttendanceConfig) => void) {
  return onSnapshot(doc(db, 'settings', 'attendance'), (snap) => {
    const data = snap.data()
    if (!data) return callback(DEFAULT_ATTENDANCE_CONFIG)
    callback({
      enabled: data.enabled === true,
      arrivalTime: data.arrivalTime ?? DEFAULT_ATTENDANCE_CONFIG.arrivalTime,
      lateToleranceMinutes: data.lateToleranceMinutes ?? DEFAULT_ATTENDANCE_CONFIG.lateToleranceMinutes,
      location: data.location ?? null,
      radiusMeters: data.radiusMeters ?? DEFAULT_ATTENDANCE_CONFIG.radiusMeters,
      workDays: Array.isArray(data.workDays) ? data.workDays : DEFAULT_WORK_DAYS,
      enabledAt: (data.enabledAt as Timestamp | undefined)?.toDate() ?? null,
    })
  })
}

export type AttendanceStatus = 'on_time' | 'late'

export interface AttendanceRecord {
  id: string
  employeeId: string
  date: string // "2026-08-23"
  status: AttendanceStatus
  checkedInAt: Date | null
  /** Biznes vaqtidagi "HH:MM" — brauzer vaqt zonasidan mustaqil. */
  checkedInTime: string | null
  gpsCoords: string | null
  distanceMeters: number | null
}

function toAttendanceRecord(id: string, data: Record<string, unknown>): AttendanceRecord {
  return {
    id,
    employeeId: (data.employeeId as string) ?? '',
    date: (data.date as string) ?? '',
    // Eski yozuvlarda `status` doim mavjud; bu yerdagi zaxira qiymat
    // ataylab 'on_time' EMAS — noaniq holatda xodimni kechikkan deb
    // ko'rsatgandan ko'ra, hech bo'lmasa aniq maydonga tayanamiz.
    status: data.status === 'late' ? 'late' : 'on_time',
    checkedInAt: (data.checkedInAt as Timestamp | undefined)?.toDate() ?? null,
    checkedInTime: (data.checkedInTime as string | undefined) ?? null,
    gpsCoords: (data.gpsCoords as string | undefined) ?? null,
    distanceMeters: (data.distanceMeters as number | undefined) ?? null,
  }
}

/** Berilgan sana oralig'idagi (inclusive, "YYYY-MM-DD") barcha davomat
 * yozuvlarini real-vaqtli kuzatadi — faqat admin o'qiy oladi (firestore.rules). */
export function subscribeAttendanceRecords(startDate: string, endDate: string, callback: (records: AttendanceRecord[]) => void) {
  const q = query(collection(db, 'attendanceRecords'), where('date', '>=', startDate), where('date', '<=', endDate))
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => toAttendanceRecord(d.id, d.data()))))
}

export interface AttendanceIssue {
  employeeId: string
  date: string
  issue: string
}

/** Xodim telefonida GPS o'chiq/ruxsatsiz bo'lgan kunlar — "kelmagan"dan
 * ajratib ko'rsatish uchun. */
export function subscribeAttendanceIssues(startDate: string, endDate: string, callback: (issues: AttendanceIssue[]) => void) {
  const q = query(collection(db, 'attendanceIssues'), where('date', '>=', startDate), where('date', '<=', endDate))
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          employeeId: (data.employeeId as string) ?? '',
          date: (data.date as string) ?? '',
          issue: (data.issue as string) ?? 'unknown',
        }
      }),
    ),
  )
}

export const ISSUE_LABELS: Record<string, string> = {
  location_off: "Telefonda joylashuv o'chiq",
  permission_denied: 'Joylashuvga ruxsat berilmagan',
  unknown: "Joylashuvni o'qib bo'lmadi",
}

/** "YYYY-MM-DD" sana satriga aylantiradi. Kalendar (kun tanlash) uchun —
 * bu brauzer sanasi, jadval kalitlari uchun `businessDateKey` ishlatiladi. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Berilgan kundan boshlab shu haftaning Dushanba kuni. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Yak, 1=Dush, ...
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

export const UZ_WEEKDAY_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']
export const UZ_WEEKDAY_FULL = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']

import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Davomat uchun joylashuv (GPS).
 *
 * Talab: davomatga biriktirilgan xodim GPS yoqilmagan bo'lsa saytga
 * KIRA OLMAYDI. Sahifa ochilganda joylashuv aniqlanadi; ruxsat yo'q, GPS
 * o'chiq yoki "aniq joylashuv" o'chirilgan bo'lsa sayt o'rnida qurilmaga
 * mos ko'rsatma chiqadi. Joylashuv olingach xodim kunda bir marta jimgina
 * belgilanadi — vaqt oynasi va radius tekshiruvi to'liq serverda
 * (server/src/routes/attendance.ts).
 *
 * Brauzer farqlari:
 *  - iPhone Safari joylashuvni faqat HTTPS'da beradi, tizimda "Joylashuv
 *    xizmatlari" o'chiq bo'lsa ham "ruxsat yo'q" (kod 1) qaytaradi, va
 *    "Aniq joylashuv" o'chiq bo'lsa bir necha km aniqlikdagi taxminiy
 *    nuqta beradi — shuning uchun aniqlik ham tekshiriladi.
 *  - Android Chrome'da telefon GPS'i o'chiq bo'lsa kod 2 darhol keladi.
 *  - Birinchi so'rov uchun iOS foydalanuvchi bosishini kutadi —
 *    ruxsat hali so'ralmagan bo'lsa tugma ko'rsatiladi.
 *  - Telegram/Instagram ichki brauzerlari ko'pincha joylashuv bermaydi.
 */

/** Server bilan bir xil chegara (MAX_ACCURACY_METERS) — bundan yomon nuqta davomatga yaramaydi. */
export const MAX_ACCURACY_METERS = 500
/** Shu aniqlikka yetganda kutish to'xtatiladi. */
const GOOD_ACCURACY_METERS = 60
const ACQUIRE_TIMEOUT_MS = 25_000

export interface Fix {
  lat: number
  lng: number
  accuracy: number
  /** Nuqta olingan payt (ms). */
  at: number
}

export type FixErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure'

export class FixError extends Error {
  readonly kind: FixErrorKind
  constructor(kind: FixErrorKind) {
    super(kind)
    this.kind = kind
  }
}

/* ------------------------------------------------------------------ */
/* Sozlama va xodim — jonli                                             */
/* ------------------------------------------------------------------ */

export function subscribeAttendanceEnabled(callback: (enabled: boolean) => void, onError?: () => void) {
  return onSnapshot(
    doc(db, 'settings', 'attendance'),
    (snap) => callback(snap.data()?.enabled === true),
    () => onError?.(),
  )
}

/** Admin xodimni davomatga qo'shsa/olib tashlasa — qayta kirishsiz kuchga kiradi. */
export function subscribeEmployeeEnrolled(employeeId: string, callback: (enrolled: boolean) => void, onError?: () => void) {
  return onSnapshot(
    doc(db, 'employees', employeeId),
    (snap) => callback(snap.data()?.attendanceEnabled === true),
    () => onError?.(),
  )
}

/* ------------------------------------------------------------------ */
/* Qurilma / brauzer                                                    */
/* ------------------------------------------------------------------ */

export interface DeviceInfo {
  os: 'ios' | 'android' | 'windows' | 'mac' | 'other'
  browser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'yandex' | 'other'
  /** Telegram/Instagram/Facebook ichidagi brauzer — joylashuv ko'pincha ishlamaydi. */
  inApp: string | null
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent
  // iPadOS 13+ o'zini Mac deb tanishtiradi — sensorli ekran bo'yicha ajratiladi.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const os: DeviceInfo['os'] = ios ? 'ios' : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Macintosh/.test(ua) ? 'mac' : 'other'
  const browser: DeviceInfo['browser'] = /YaBrowser/.test(ua)
    ? 'yandex'
    : /SamsungBrowser/.test(ua)
      ? 'samsung'
      : /EdgiOS|EdgA|Edg\//.test(ua)
        ? 'edge'
        : /FxiOS|Firefox/.test(ua)
          ? 'firefox'
          : /CriOS|Chrome/.test(ua)
            ? 'chrome'
            : /Safari/.test(ua)
              ? 'safari'
              : 'other'
  const inApp = /Telegram/i.test(ua) || 'TelegramWebview' in window
    ? 'Telegram'
    : /Instagram/.test(ua)
      ? 'Instagram'
      : /FBAN|FBAV/.test(ua)
        ? 'Facebook'
        : null
  return { os, browser, inApp }
}

const OS_NAMES: Record<DeviceInfo['os'], string> = { ios: 'iPhone', android: 'Android', windows: 'Windows', mac: 'Mac', other: 'Boshqa' }
const BROWSER_NAMES: Record<DeviceInfo['browser'], string> = {
  safari: 'Safari',
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung Internet',
  yandex: 'Yandex',
  other: 'brauzer',
}

/** Admin ko'radigan qisqa nom — "iPhone · Safari". */
export function platformLabel(info: DeviceInfo = detectDevice()): string {
  return `${OS_NAMES[info.os]} · ${info.inApp ?? BROWSER_NAMES[info.browser]}`
}

/* ------------------------------------------------------------------ */
/* Joylashuv                                                            */
/* ------------------------------------------------------------------ */

/** Brauzer ruxsat holatini bilsa qaytaradi (eski Safari'da doim 'prompt'). */
export async function permissionState(): Promise<PermissionState | 'unknown'> {
  if (!('permissions' in navigator)) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

/**
 * Bir nechta soniya davomida eng aniq nuqtani yig'adi: birinchi javob
 * ko'pincha Wi-Fi/minora bo'yicha taxminiy bo'ladi, GPS esa bir oz
 * keyin aniqlashadi. Yetarlicha aniq nuqta kelishi bilan to'xtaydi.
 */
export function acquireFix(timeoutMs = ACQUIRE_TIMEOUT_MS): Promise<Fix> {
  if (!window.isSecureContext) return Promise.reject(new FixError('insecure'))
  if (!('geolocation' in navigator)) return Promise.reject(new FixError('unsupported'))

  return new Promise((resolve, reject) => {
    let best: Fix | null = null
    let settled = false
    let watchId: number | null = null

    const finish = (result: Fix | FixError) => {
      if (settled) return
      settled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      clearTimeout(timer)
      if (result instanceof FixError) reject(result)
      else resolve(result)
    }

    const timer = setTimeout(() => finish(best ?? new FixError('timeout')), timeoutMs)

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: Fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp || Date.now(),
        }
        if (!best || fix.accuracy < best.accuracy) best = fix
        if (fix.accuracy <= GOOD_ACCURACY_METERS) finish(fix)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) finish(new FixError('denied'))
        // Kod 2 — qurilmada joylashuv o'chiq; avvalroq nuqta olingan bo'lsa o'shani beramiz.
        else if (err.code === err.POSITION_UNAVAILABLE) finish(best ?? new FixError('unavailable'))
        else finish(best ?? new FixError('timeout'))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    )
  })
}

/* ------------------------------------------------------------------ */
/* Belgilash                                                            */
/* ------------------------------------------------------------------ */

const SETTLED_KEY = 'selta.attendance.settledDate'
const ISSUE_KEY = 'selta.attendance.issue'
const LAST_FIX_KEY = 'selta.attendance.lastFixAt'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function storageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
  } catch {
    /* private rejimda yozilmasligi mumkin — zararsiz */
  }
}

export function isSettledToday(employeeId: string): boolean {
  return storageGet(localStorage, SETTLED_KEY) === `${employeeId}:${todayKey()}`
}

/** Oxirgi muvaffaqiyatli joylashuv payti — sahifa yangilanganda darvozani qayta kutdirmaslik uchun. */
export function lastFixAt(): number {
  return Number(storageGet(sessionStorage, LAST_FIX_KEY)) || 0
}

export function rememberFix(fix: Fix) {
  storageSet(sessionStorage, LAST_FIX_KEY, String(fix.at || Date.now()))
}

export type CheckinReason = 'recorded' | 'already' | 'disabled' | 'not_enrolled' | 'out_of_range' | 'imprecise' | 'stale' | 'error' | string

/**
 * Kunlik belgilash. Server qarori yakuniy bo'lsa (belgilandi / allaqachon /
 * nazorat o'chiq) shu kun qayta yuborilmaydi; "hududdan tashqarida" bo'lsa
 * keyingi tekshiruvda yana urinadi (xodim ishxonaga yetib kelganda).
 */
export async function submitCheckin(employeeId: string, fix: Fix): Promise<CheckinReason> {
  if (isSettledToday(employeeId)) return 'already'
  try {
    const result = await apiPost<{ recorded?: boolean; reason?: string }>('/submitAttendanceCheckin', {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: Math.round(fix.accuracy),
      fixAgeMs: Math.max(0, Date.now() - fix.at),
      source: 'web',
      platform: platformLabel(),
    })
    const reason = result.recorded ? 'recorded' : (result.reason ?? 'error')
    if (['recorded', 'already', 'disabled', 'not_enrolled'].includes(reason)) {
      storageSet(localStorage, SETTLED_KEY, `${employeeId}:${todayKey()}`)
    }
    return reason
  } catch {
    return 'error'
  }
}

/**
 * Admin "kelmagan"ni "GPS o'chiq"dan ajrata olishi uchun — sabab kuniga
 * bir marta yuboriladi (har bir urinishda emas).
 */
export async function reportIssue(employeeId: string, kind: FixErrorKind | 'imprecise', accuracy?: number) {
  const issue = kind === 'denied' ? 'permission_denied' : kind === 'unavailable' || kind === 'timeout' ? 'location_off' : kind
  if (isSettledToday(employeeId)) return
  const key = `${employeeId}:${todayKey()}:${issue}`
  if (storageGet(localStorage, ISSUE_KEY) === key) return
  storageSet(localStorage, ISSUE_KEY, key)
  try {
    await apiPost('/submitAttendanceCheckin', {
      issue,
      source: 'web',
      platform: platformLabel(),
      ...(accuracy !== undefined ? { accuracy: Math.round(accuracy) } : {}),
    })
  } catch {
    /* sokin */
  }
}

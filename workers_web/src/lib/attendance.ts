import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Davomat uchun GPS. Ilovadagi `AttendanceGate` bilan bir xil g'oya —
 * sahifa ochilganda/fondan qaytganda sokin ravishda joylashuv yuboriladi,
 * xodimga hech narsa ko'rsatilmaydi (talab). Vaqt oynasi va radius
 * tekshiruvi to'liq serverda.
 *
 * iOS xususiyati: Safari `navigator.permissions.query({name:'geolocation'})`
 * ni to'liq qo'llab-quvvatlamaydi va joylashuvni FAQAT foydalanuvchi
 * harakatidan keyin so'rashga ruxsat beradi. Shuning uchun ruxsat
 * birinchi marta ochiq tarzda, tugma bosish orqali so'raladi
 * (`AttendancePermissionCard`), keyin esa avtomatik ishlaydi.
 */
export function subscribeAttendanceEnabled(callback: (enabled: boolean) => void) {
  return onSnapshot(doc(db, 'settings', 'attendance'), (snap) => {
    callback(snap.data()?.enabled === true)
  })
}

const SETTLED_KEY = 'selta.attendance.settledDate'
const PROMPTED_KEY = 'selta.attendance.prompted'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function isSettledToday(): boolean {
  try {
    return localStorage.getItem(SETTLED_KEY) === todayKey()
  } catch {
    return false
  }
}

function markSettledToday() {
  try {
    localStorage.setItem(SETTLED_KEY, todayKey())
  } catch {
    /* private rejimda localStorage yozilmasligi mumkin — zararsiz */
  }
}

export function hasBeenPrompted(): boolean {
  try {
    return localStorage.getItem(PROMPTED_KEY) === '1'
  } catch {
    return false
  }
}

export function markPrompted() {
  try {
    localStorage.setItem(PROMPTED_KEY, '1')
  } catch {
    /* zararsiz */
  }
}

/** Brauzer joylashuvga ruxsat berilganini bilsa qaytaradi (iOS'da ko'pincha 'prompt'). */
export async function geolocationPermissionState(): Promise<PermissionState | 'unsupported'> {
  if (!('geolocation' in navigator)) return 'unsupported'
  if (!('permissions' in navigator)) return 'prompt'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return 'prompt'
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    })
  })
}

/**
 * Bir marta belgilashga urinadi. Hech qanday holatda foydalanuvchiga
 * xato ko'rsatmaydi. Kun uchun ish tugagach (belgilandi / allaqachon bor /
 * nazorat o'chiq) qayta urinmaydi.
 */
export async function tryCheckin(): Promise<void> {
  if (isSettledToday()) return
  if (!('geolocation' in navigator)) return

  try {
    const position = await getPosition()
    const result = await apiPost<{ recorded?: boolean; reason?: string }>('/submitAttendanceCheckin', {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    })
    if (result.recorded || ['already', 'disabled', 'not_enrolled'].includes(result.reason ?? '')) {
      markSettledToday()
    }
  } catch (err) {
    // Joylashuv olinmadi — adminga sababini bildiramiz, shunda u
    // "kelmagan" bilan "GPS o'chiq"ni ajrata oladi.
    const code = (err as GeolocationPositionError | undefined)?.code
    const issue = code === 1 ? 'permission_denied' : code === 2 ? 'location_off' : null
    if (issue) {
      try {
        await apiPost('/submitAttendanceCheckin', { issue })
      } catch {
        /* sokin */
      }
    }
  }
}

import { useCallback, useEffect, useState } from 'react'
import { MapPin, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  subscribeAttendanceEnabled,
  tryCheckin,
  geolocationPermissionState,
  hasBeenPrompted,
  markPrompted,
  isSettledToday,
} from '@/lib/attendance'

/**
 * Davomat uchun joylashuv. Ikki vazifasi bor:
 *
 *  1. Ruxsat ALLAQACHON berilgan bo'lsa — sahifa ochilganda va fondan
 *     qaytganda sokin ravishda belgilaydi (ilovadagi AttendanceGate kabi,
 *     xodimga hech narsa ko'rsatilmaydi).
 *  2. Ruxsat hali so'ralmagan bo'lsa — bir martalik karta ko'rsatadi.
 *     Bu iOS talabi: Safari joylashuvni faqat foydalanuvchi harakatidan
 *     (tugma bosish) keyin so'rashga ruxsat beradi, sahifa ochilishida
 *     avtomatik so'rov ishlamaydi. Shuning uchun bu yerda ochiq
 *     tushuntirish bilan tugma beriladi — bir marta bosilgach, keyingi
 *     kunlar butunlay avtomatik ketadi.
 */
export function AttendanceGate() {
  const { profile, claims } = useAuth()
  const [globallyEnabled, setGloballyEnabled] = useState(false)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const enrolled = profile?.attendanceEnabled === true
  const active = enrolled && globallyEnabled && !!claims

  useEffect(() => {
    if (!enrolled) return
    return subscribeAttendanceEnabled(setGloballyEnabled)
  }, [enrolled])

  const attempt = useCallback(async () => {
    if (!active || isSettledToday()) return
    const state = await geolocationPermissionState()
    if (state === 'unsupported') return
    if (state === 'granted') {
      setNeedsPermission(false)
      void tryCheckin()
      return
    }
    if (state === 'denied') {
      // Ruxsat rad etilgan — serverga sababini bildiramiz (admin ko'rishi
      // uchun) va kartani ko'rsatamiz, chunki uni faqat brauzer
      // sozlamalaridan qayta yoqish mumkin.
      void tryCheckin()
      setNeedsPermission(true)
      return
    }
    // 'prompt' — iOS'da avtomatik so'rash ishlamaydi, tugma kerak.
    if (hasBeenPrompted()) {
      void tryCheckin()
    } else {
      setNeedsPermission(true)
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    void attempt()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void attempt()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [active, attempt])

  if (!active || !needsPermission || dismissed) return null

  return (
    <div className="mx-4 mb-4 animate-fade-up rounded-2xl border border-brand-primary/25 bg-brand-primary/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/12 text-brand-primary">
          <MapPin size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">Joylashuvga ruxsat bering</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-dark">
            Ishga kelganingiz avtomatik belgilanishi uchun kerak. Faqat ishxonaga kelganingizda, kuniga bir marta
            tekshiriladi — boshqa vaqtda joylashuvingiz kuzatilmaydi.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                markPrompted()
                await tryCheckin()
                const state = await geolocationPermissionState()
                if (state !== 'denied') setNeedsPermission(false)
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-xs font-extrabold text-white active:scale-95"
            >
              <ShieldCheck size={15} />
              Ruxsat berish
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="h-10 rounded-xl px-3 text-xs font-bold text-gray-dark active:scale-95"
            >
              Keyinroq
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

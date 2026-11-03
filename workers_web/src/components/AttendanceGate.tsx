import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, Crosshair, LogOut, MapPin, MapPinOff, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  FixError,
  MAX_ACCURACY_METERS,
  acquireFix,
  detectDevice,
  isSettledToday,
  lastFixAt,
  permissionState,
  platformLabel,
  rememberFix,
  reportIssue,
  submitCheckin,
  subscribeAttendanceEnabled,
  subscribeEmployeeEnrolled,
  type DeviceInfo,
  type Fix,
} from '@/lib/attendance'

export type Phase =
  | 'loading'
  | 'off'
  | 'need_tap'
  | 'locating'
  | 'ok'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'imprecise'
  | 'unsupported'
  | 'insecure'

/** Fonda qayta tekshirish oralig'i (xodim ishxonaga yetib kelganda belgilanishi uchun ham). */
const RECHECK_MS = 5 * 60_000
/** Sahifa yangilanganda shu muddat ichidagi nuqta yetarli — darvoza qayta kutdirmaydi. */
const REUSE_FIX_MS = 3 * 60_000
/** Sozlama/xodim o'qilmasa — ishni to'xtatmaslik uchun darvozasiz davom etiladi. */
const CONFIG_TIMEOUT_MS = 8_000

/**
 * Davomat darvozasi — davomatga biriktirilgan xodim joylashuv (GPS)
 * yoqilmaguncha saytdan foydalana olmaydi. Joylashuv olingach kunlik
 * belgilash jimgina yuboriladi; sayt ochiq turganda vaqti-vaqti bilan
 * qayta tekshiriladi va GPS o'chirilsa sayt yana yopiladi.
 *
 * Davomat o'chiq yoki xodim biriktirilmagan bo'lsa — hech narsa
 * ko'rsatilmaydi, sayt odatdagidek ochiladi.
 */
export function AttendanceGate({ children }: { children: ReactNode }) {
  const { claims, logout } = useAuth()
  const employeeId = claims?.employeeId ?? null
  const device = useMemo(detectDevice, [])

  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [configFailed, setConfigFailed] = useState(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [slow, setSlow] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (!employeeId) return
    const fail = () => setConfigFailed(true)
    const unsubA = subscribeAttendanceEnabled(setEnabled, fail)
    const unsubB = subscribeEmployeeEnrolled(employeeId, setEnrolled, fail)
    const timer = setTimeout(fail, CONFIG_TIMEOUT_MS)
    return () => {
      unsubA()
      unsubB()
      clearTimeout(timer)
    }
  }, [employeeId])

  const configKnown = enabled !== null && enrolled !== null
  const required = configKnown ? enabled === true && enrolled === true : configFailed ? false : null

  const afterFix = useCallback(
    (fix: Fix) => {
      rememberFix(fix)
      if (employeeId && !isSettledToday(employeeId)) void submitCheckin(employeeId, fix)
    },
    [employeeId],
  )

  /** Darvozani ochish uchun joylashuv — xato bo'lsa tegishli ko'rsatma bosqichi. */
  const locate = useCallback(async () => {
    if (busy.current || !employeeId) return
    busy.current = true
    setPhase('locating')
    setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 8_000)
    try {
      const fix = await acquireFix()
      setAccuracy(fix.accuracy)
      if (fix.accuracy > MAX_ACCURACY_METERS) {
        setPhase('imprecise')
        void reportIssue(employeeId, 'imprecise', fix.accuracy)
        return
      }
      setPhase('ok')
      afterFix(fix)
    } catch (err) {
      const kind = err instanceof FixError ? err.kind : 'timeout'
      setPhase(kind)
      void reportIssue(employeeId, kind)
    } finally {
      clearTimeout(slowTimer)
      busy.current = false
    }
  }, [employeeId, afterFix])

  /**
   * Sayt ochiq turganda jimgina qayta aniqlash — darvoza yopilmaydi.
   * Faqat ruxsat olib tashlansa yoki GPS o'chirilsa sayt yana yopiladi;
   * kuchsiz signal (bino ichida) uchun yopilmaydi.
   */
  const quietCheck = useCallback(async () => {
    if (busy.current || !employeeId) return
    busy.current = true
    try {
      const fix = await acquireFix(15_000)
      if (fix.accuracy <= MAX_ACCURACY_METERS) afterFix(fix)
    } catch (err) {
      if (err instanceof FixError && (err.kind === 'denied' || err.kind === 'unavailable')) {
        setPhase(err.kind)
        void reportIssue(employeeId, err.kind)
      }
    } finally {
      busy.current = false
    }
  }, [employeeId, afterFix])

  /** Boshlang'ich qaror: ruxsat bor bo'lsa avtomatik, bo'lmasa tugma orqali. */
  const start = useCallback(async () => {
    const state = await permissionState()
    // Telegram/Instagram ichki brauzeri — ruxsat oldindan berilmagan bo'lsa
    // ishlamaydi, to'g'ridan-to'g'ri haqiqiy brauzerga yo'naltiramiz.
    if (device.inApp && state !== 'granted') {
      setPhase('unsupported')
      return
    }
    if (state === 'denied') {
      setPhase('denied')
      if (employeeId) void reportIssue(employeeId, 'denied')
      return
    }
    if (state === 'granted') {
      if (Date.now() - lastFixAt() < REUSE_FIX_MS) {
        // Yaqinda aniqlangan — sahifa yangilanganda qayta kutdirmaymiz,
        // bugungi belgilash kerak bo'lsa fonda yuboriladi.
        setPhase('ok')
        if (employeeId && !isSettledToday(employeeId)) void quietCheck()
        return
      }
      void locate()
      return
    }
    // 'prompt' / noma'lum — iPhone ruxsat oynasini faqat bosishdan keyin
    // ishonchli ko'rsatadi; boshqalarda ham nima uchun so'ralayotganini
    // tushuntirib, so'ng so'raymiz.
    setPhase('need_tap')
  }, [device.inApp, employeeId, locate, quietCheck])

  useEffect(() => {
    if (required === null) return
    if (!required) {
      setPhase('off')
      return
    }
    void start()
  }, [required, start])

  // Fonda: sayt ochiq turganda vaqti-vaqti bilan, va sozlamalardan
  // qaytganda (iPhone'da joylashuv yoqilgach) avtomatik qayta tekshirish.
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    if (!required || !employeeId) return

    const backgroundCheck = async () => {
      if (document.visibilityState !== 'visible') return
      const current = phaseRef.current
      if (current === 'ok') {
        if (Date.now() - lastFixAt() < RECHECK_MS && isSettledToday(employeeId)) return
        await quietCheck()
      } else if (current !== 'locating' && current !== 'loading' && current !== 'off') {
        void start()
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void backgroundCheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const interval = setInterval(() => void backgroundCheck(), RECHECK_MS)

    // Chrome/Edge ruxsat o'zgarishini xabar qiladi — tugmasiz davom etadi.
    let permStatus: PermissionStatus | null = null
    const onPermChange = () => void start()
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((s) => {
          permStatus = s
          s.addEventListener('change', onPermChange)
        })
        .catch(() => {})
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(interval)
      permStatus?.removeEventListener('change', onPermChange)
    }
  }, [required, employeeId, quietCheck, start])

  if (phase === 'off' || phase === 'ok') return <>{children}</>

  return (
    <GateScreen
      phase={phase}
      device={device}
      accuracy={accuracy}
      slow={slow}
      onLocate={() => void locate()}
      onLogout={() => void logout()}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Ko'rinish                                                            */
/* ------------------------------------------------------------------ */

function steps(phase: Phase, d: DeviceInfo): string[] {
  const browserName = d.browser === 'safari' ? 'Safari' : d.browser === 'chrome' ? 'Chrome' : 'brauzeringiz'
  const iosLocationServices = 'iPhone Sozlamalar → Maxfiylik va xavfsizlik → Joylashuv xizmatlari — yoqilgan bo\'lsin.'
  const iosAppAccess =
    d.browser === 'safari'
      ? 'Shu ro\'yxatning pastida «Safari veb-saytlari» → «Ilovadan foydalanganda» va «Aniq joylashuv» yoqilsin.'
      : `Shu ro'yxatda «${browserName}» → «Ilovadan foydalanganda» va «Aniq joylashuv» yoqilsin.`

  if (phase === 'denied') {
    if (d.os === 'ios') {
      return [
        iosLocationServices,
        iosAppAccess,
        d.browser === 'safari'
          ? 'Safari\'ga qayting: manzil satridagi «aA» → «Veb-sayt sozlamalari» → «Joylashuv» → «Ruxsat berish».'
          : `${browserName}'ga qayting va sahifani yangilang.`,
        'Pastdagi «Qayta tekshirish» tugmasini bosing.',
      ]
    }
    if (d.os === 'android') {
      return [
        'Manzil satri yonidagi belgini (qulf yoki ⓘ) bosing → «Ruxsatlar» → «Joylashuv» → «Ruxsat berish».',
        `Telefon Sozlamalar → Ilovalar → ${browserName} → Ruxsatlar → Joylashuv → «Ilovadan foydalanganda».`,
        'Telefonda «Joylashuv» (GPS) yoqilgan bo\'lsin.',
        'Pastdagi «Qayta tekshirish» tugmasini bosing.',
      ]
    }
    return [
      'Manzil satridagi qulf belgisini bosing → «Joylashuv» → «Ruxsat berish».',
      d.os === 'mac'
        ? 'Mac: Tizim sozlamalari → Maxfiylik va xavfsizlik → Joylashuv xizmatlari → brauzeringiz yoqilgan bo\'lsin.'
        : 'Windows: Sozlamalar → Maxfiylik → Joylashuv — «Joylashuvga ruxsat» yoqilgan bo\'lsin.',
      'Sahifani yangilang yoki «Qayta tekshirish»ni bosing.',
    ]
  }

  if (phase === 'unavailable' || phase === 'timeout') {
    const weak = phase === 'timeout' ? ['Signal kuchsiz bo\'lishi mumkin — derazaga yoki ochiq joyga yaqinroq turing.'] : []
    if (d.os === 'ios') return [iosLocationServices, iosAppAccess, ...weak, '«Qayta tekshirish»ni bosing.']
    if (d.os === 'android') {
      return [
        'Ekranning yuqorisidan pastga suring va «Joylashuv» (GPS) tugmasini yoqing.',
        'Sozlamalar → Joylashuv → «Google joylashuv aniqligi» yoqilgan bo\'lsin.',
        ...weak,
        '«Qayta tekshirish»ni bosing.',
      ]
    }
    return [
      d.os === 'mac' ? 'Mac: Joylashuv xizmatlari yoqilgan bo\'lsin.' : 'Windows: Sozlamalar → Maxfiylik → Joylashuv — yoqilgan bo\'lsin.',
      'Wi-Fi yoqilgan bo\'lsin — kompyuter joylashuvni Wi-Fi orqali aniqlaydi.',
      '«Qayta tekshirish»ni bosing.',
    ]
  }

  if (phase === 'imprecise') {
    if (d.os === 'ios') {
      return [
        'iPhone Sozlamalar → Maxfiylik va xavfsizlik → Joylashuv xizmatlari.',
        d.browser === 'safari' ? '«Safari veb-saytlari» ni oching.' : `«${browserName}» ni oching.`,
        '«Aniq joylashuv» (Precise Location) ni yoqing.',
        'Qaytib «Qayta tekshirish»ni bosing.',
      ]
    }
    if (d.os === 'android') {
      return [
        'Sozlamalar → Joylashuv → «Google joylashuv aniqligi» ni yoqing.',
        `Sozlamalar → Ilovalar → ${browserName} → Ruxsatlar → Joylashuv → «Aniq joylashuvdan foydalanish» yoqilsin.`,
        'Ochiq joyda «Qayta tekshirish»ni bosing.',
      ]
    }
    return ['Wi-Fi yoqilgan bo\'lsin.', 'Tizim sozlamalarida joylashuv xizmati yoqilgan bo\'lsin.', '«Qayta tekshirish»ni bosing.']
  }

  if (phase === 'unsupported') {
    return d.inApp
      ? [
          `${d.inApp} ichidagi brauzer joylashuvni bermaydi.`,
          'Pastdagi tugma bilan havolani nusxalang.',
          d.os === 'ios' ? 'Safari\'ni ochib, havolani manzil satriga qo\'ying.' : 'Chrome\'ni ochib, havolani manzil satriga qo\'ying.',
        ]
      : ['Bu brauzer joylashuvni qo\'llab-quvvatlamaydi.', d.os === 'ios' ? 'Saytni Safari orqali oching.' : 'Saytni Chrome orqali oching.']
  }

  if (phase === 'insecure') return ['Sayt faqat xavfsiz (https://) manzil orqali joylashuvni oladi.', 'Rasmiy havola orqali qayta kiring.']
  return []
}

const TITLES: Partial<Record<Phase, string>> = {
  need_tap: 'Joylashuvni yoqing',
  locating: 'Joylashuv aniqlanmoqda…',
  denied: 'Joylashuvga ruxsat berilmagan',
  unavailable: 'Joylashuv (GPS) o\'chiq',
  timeout: 'Joylashuvni aniqlab bo\'lmadi',
  imprecise: '«Aniq joylashuv» o\'chirilgan',
  unsupported: 'Bu brauzerda joylashuv ishlamaydi',
  insecure: 'Xavfsiz ulanish kerak',
}

export function GateScreen({
  phase,
  device,
  accuracy,
  slow,
  onLocate,
  onLogout,
}: {
  phase: Phase
  device: DeviceInfo
  accuracy: number | null
  slow: boolean
  onLocate: () => void
  onLogout: () => void
}) {
  const [copied, setCopied] = useState(false)
  const list = steps(phase, device)
  const error = phase !== 'need_tap' && phase !== 'locating' && phase !== 'loading'
  const Icon = phase === 'need_tap' || phase === 'locating' || phase === 'loading' ? MapPin : phase === 'unsupported' ? Smartphone : phase === 'insecure' ? ShieldAlert : MapPinOff

  if (phase === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-primary/20 border-t-brand-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              error ? 'bg-danger-bg text-danger' : 'bg-brand-primary/10 text-brand-primary'
            } ${phase === 'locating' ? 'animate-pulse' : ''}`}
          >
            <Icon size={30} />
          </div>
          <h1 className="mt-4 font-heading text-xl font-extrabold text-ink">{TITLES[phase]}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-dark">
            {phase === 'need_tap'
              ? 'Ishga kelganingiz avtomatik belgilanishi uchun joylashuv kerak. U faqat sayt ochiq turganda tekshiriladi — boshqa vaqtda kuzatilmaydi.'
              : phase === 'locating'
                ? slow
                  ? 'GPS signali kutilmoqda — ochiq joyda yoki deraza yonida tezroq aniqlanadi.'
                  : 'Bir necha soniya kuting.'
                : phase === 'imprecise'
                  ? `Telefon taxminiy joylashuv bermoqda${accuracy ? ` (~${accuracy >= 1000 ? `${(accuracy / 1000).toFixed(1)} km` : `${Math.round(accuracy)} m`})` : ''}. Davomat uchun aniq joylashuv kerak.`
                  : 'Saytdan foydalanish uchun joylashuv yoqilgan bo\'lishi shart. Quyidagilarni bajaring:'}
          </p>
        </div>

        {phase === 'need_tap' && device.os === 'ios' && (
          <p className="mt-4 rounded-xl bg-bg px-3.5 py-2.5 text-xs leading-relaxed text-ink">
            Tugmani bosgach chiqadigan oynada <strong>«Ruxsat berish»</strong> ni tanlang.
          </p>
        )}

        {list.length > 0 && (
          <ol className="mt-5 space-y-2.5">
            {list.map((s, i) => (
              <li key={i} className="flex gap-3 text-[13.5px] leading-snug text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-extrabold text-brand-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6 space-y-2">
          {phase === 'unsupported' && device.inApp ? (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.origin)
                  setCopied(true)
                } catch {
                  window.prompt('Havolani nusxalang:', window.location.origin)
                }
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary text-sm font-extrabold text-white active:scale-[0.98]"
            >
              <Copy size={17} />
              {copied ? 'Nusxalandi' : 'Havolani nusxalash'}
            </button>
          ) : phase !== 'insecure' ? (
            <button
              onClick={onLocate}
              disabled={phase === 'locating'}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary text-sm font-extrabold text-white active:scale-[0.98] disabled:opacity-60"
            >
              {phase === 'locating' ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : phase === 'need_tap' ? (
                <Crosshair size={17} />
              ) : (
                <RefreshCw size={17} />
              )}
              {phase === 'need_tap' ? 'Joylashuvni yoqish' : phase === 'locating' ? 'Aniqlanmoqda…' : 'Qayta tekshirish'}
            </button>
          ) : null}
          <button
            onClick={onLogout}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-gray-dark hover:bg-bg"
          >
            <LogOut size={16} />
            Chiqish
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-gray">{platformLabel(device)}</p>
      </div>
    </div>
  )
}

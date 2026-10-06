import { useCallback, useEffect, useState } from 'react'
import type { ReceiptBlock } from '@/lib/receipt'

/**
 * Admin ilovasi (APK) ichida ochilgan admin panel ↔ ilovaning Bluetooth
 * printeri. Ilova `window.SeltaPrinter` kanalini beradi
 * (mobile/lib/features/admin/printer_bridge.dart) va javobni
 * `selta-printer` hodisasi bilan qaytaradi. Oddiy brauzerda kanal yo'q —
 * u yerda Bluetooth printerga ulanib bo'lmaydi.
 */
interface SeltaPrinterChannel {
  postMessage: (message: string) => void
}

export interface AppPrinterStatus {
  selected: boolean
  name: string | null
  paperMm: 58 | 80
  feedLines: number
}

export interface AppPrinterResult {
  ok: boolean
  message: string
}

type AppPrinterEvent = ({ type: 'status' } & AppPrinterStatus) | ({ type: 'result' } & AppPrinterResult)

function channel(): SeltaPrinterChannel | null {
  const c = (window as unknown as { SeltaPrinter?: SeltaPrinterChannel }).SeltaPrinter
  return c && typeof c.postMessage === 'function' ? c : null
}

export function isInApp(): boolean {
  return channel() !== null
}

function post(message: Record<string, unknown>): boolean {
  const c = channel()
  if (!c) return false
  c.postMessage(JSON.stringify(message))
  return true
}

/** Chekni ilovaga yuboradi — ilova uni ko'rsatib, printerdan chiqaradi. */
export function printInApp(title: string, blocks: ReceiptBlock[]): boolean {
  return post({ action: 'print', title, blocks })
}

/**
 * Ilova printeri holati va boshqaruvi. Holat sahifa ochilganda so'raladi
 * va har bir amaldan keyin ilova o'zi yangilab yuboradi.
 */
export function useAppPrinter() {
  const inApp = isInApp()
  const [status, setStatus] = useState<AppPrinterStatus | null>(null)
  const [result, setResult] = useState<AppPrinterResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!inApp) return
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<AppPrinterEvent>).detail
      if (!detail || typeof detail !== 'object') return
      if (detail.type === 'status') {
        setStatus({
          selected: detail.selected === true,
          name: typeof detail.name === 'string' ? detail.name : null,
          paperMm: detail.paperMm === 80 ? 80 : 58,
          feedLines: Number(detail.feedLines) || 3,
        })
        setBusy(false)
      } else if (detail.type === 'result') {
        setResult({ ok: detail.ok === true, message: String(detail.message ?? '') })
      }
    }
    window.addEventListener('selta-printer', onEvent)
    post({ action: 'status' })
    return () => window.removeEventListener('selta-printer', onEvent)
  }, [inApp])

  const openSettings = useCallback(() => {
    setResult(null)
    post({ action: 'settings' })
  }, [])

  const testPrint = useCallback(() => {
    setResult(null)
    setBusy(true)
    post({ action: 'test' })
  }, [])

  return { inApp, status, result, busy, openSettings, testPrint }
}

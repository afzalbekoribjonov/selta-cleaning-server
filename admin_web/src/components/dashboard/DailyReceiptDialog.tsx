import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, Smartphone, X } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { Spinner } from '@/components/ui/Spinner'
import { layoutReceipt, type ReceiptBlock } from '@/lib/receipt'

/** Ilova (admin APK) ichidagi WebView beradigan kanal — chekni Bluetooth printerga yuboradi. */
interface SeltaPrinterChannel {
  postMessage: (message: string) => void
}

function appPrinter(): SeltaPrinterChannel | null {
  const channel = (window as unknown as { SeltaPrinter?: SeltaPrinterChannel }).SeltaPrinter
  return channel && typeof channel.postMessage === 'function' ? channel : null
}

/**
 * "Kunlik hisobot cheki" — server bazadan hisoblagan tayyor bloklar
 * (server: lib/dailyReceipt.ts). Ilova ichida ochilgan admin panelda
 * chek ilovaning Bluetooth printeriga yuboriladi; kompyuter brauzerida
 * esa chek kengligidagi sahifa sifatida chop etiladi.
 */
export function DailyReceiptDialog({ date, onClose }: { date: string; onClose: () => void }) {
  useEscapeClose(onClose)
  const [paper, setPaper] = useState<58 | 80>(80)
  const [sent, setSent] = useState(false)
  const query = useQuery({
    queryKey: ['dailyReceipt', date],
    queryFn: () => apiPost<{ blocks: ReceiptBlock[] }>('/dailyReceiptReport', { date }),
    staleTime: 0,
  })
  const printer = appPrinter()
  const lines = query.data ? layoutReceipt(query.data.blocks, paper === 58 ? 32 : 48) : []

  function sendToApp() {
    if (!printer || !query.data) return
    printer.postMessage(JSON.stringify({ title: `Kunlik hisobot · ${date}`, blocks: query.data.blocks }))
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-extrabold text-ink">Kunlik hisobot cheki</h3>
            <p className="text-xs text-gray-dark">{date} — bazadan hisoblangan</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg" aria-label="Yopish">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pt-3">
          <span className="text-xs font-semibold text-gray-dark">Qog'oz:</span>
          <div className="flex rounded-lg border border-border p-0.5 text-xs font-bold">
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                onClick={() => setPaper(w)}
                className={`rounded-md px-2.5 py-1 ${paper === w ? 'bg-brand-primary text-white' : 'text-gray-dark'}`}
              >
                {w} mm
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {query.isLoading ? (
            <Spinner className="py-10" />
          ) : query.isError ? (
            <p className="py-10 text-center text-sm font-semibold text-danger">
              {query.error instanceof ApiError ? query.error.message : "Hisobotni yuklab bo'lmadi"}
            </p>
          ) : (
            <ReceiptPaper lines={lines} />
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
          {printer ? (
            <button
              onClick={sendToApp}
              disabled={!query.data}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary text-sm font-bold text-white disabled:opacity-50"
            >
              <Smartphone size={16} />
              {sent ? 'Ilovaga yuborildi' : 'Bluetooth printerda chop etish'}
            </button>
          ) : (
            <button
              onClick={() => window.print()}
              disabled={!query.data}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary text-sm font-bold text-white disabled:opacity-50"
            >
              <Printer size={16} />
              Chop etish
            </button>
          )}
        </div>
      </div>

      {/* Brauzerda chop etish: faqat chek, qog'oz enida. */}
      {query.data &&
        createPortal(
          <div id="receipt-print-root" className="receipt-print" style={{ width: paper === 58 ? '58mm' : '80mm' }}>
            <ReceiptPaper lines={lines} plain />
          </div>,
          document.body,
        )}
    </div>
  )
}

function ReceiptPaper({ lines, plain = false }: { lines: ReturnType<typeof layoutReceipt>; plain?: boolean }) {
  return (
    <div className={plain ? '' : 'mx-auto w-fit rounded-md bg-white px-4 py-5 shadow-md'}>
      {lines.map((line, i) =>
        line.logo ? (
          <div key={i} className="mb-2 text-center font-heading text-lg font-extrabold tracking-wide text-black">
            SELTA CLEANING
          </div>
        ) : (
          <pre
            key={i}
            className={`m-0 whitespace-pre font-mono leading-snug text-black ${line.bold ? 'font-bold' : ''} ${
              line.large ? 'text-[15px]' : 'text-[11px]'
            }`}
          >
            {line.text || ' '}
          </pre>
        ),
      )}
    </div>
  )
}

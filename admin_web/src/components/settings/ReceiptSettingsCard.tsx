import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Printer, RotateCcw } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import {
  DEFAULT_RECEIPT_SETTINGS,
  RECEIPT_LIMITS,
  layoutReceipt,
  sampleReceipt,
  subscribeReceiptSettings,
  updateReceiptSettings,
  type ReceiptSettings,
} from '@/lib/receipt'

const TOGGLES: { key: keyof ReceiptSettings; label: string }[] = [
  { key: 'showLogo', label: 'Logotip' },
  { key: 'showCustomerName', label: 'Mijoz ismi' },
  { key: 'showCustomerPhone', label: 'Mijoz telefoni' },
  { key: 'showCustomerAddress', label: 'Mijoz manzili' },
  { key: 'showItemSize', label: "Mahsulot o'lchami" },
  { key: 'showItemTariff', label: 'Mahsulot tarifi' },
  { key: 'showItemStatus', label: 'Mahsulot holati (yetkazilmagan buyurtmada)' },
  { key: 'showCashier', label: 'Xodim ismi' },
]

const toText = (lines: string[]) => lines.join('\n')
const toLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/**
 * Chek ko'rinishi — ilova Bluetooth printerda chiqaradigan chek shu
 * sozlama bo'yicha quriladi. O'ngdagi namuna qog'ozdagidek joylashtiriladi
 * (ilova bilan bir xil qoida).
 */
export function ReceiptSettingsCard() {
  const [current, setCurrent] = useState<ReceiptSettings | null>(null)
  const [draft, setDraft] = useState<ReceiptSettings | null>(null)
  const [headerText, setHeaderText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [paper, setPaper] = useState<58 | 80>(58)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeReceiptSettings((s) => {
        setCurrent(s)
        setDraft((d) => d ?? s)
        setHeaderText((t) => (t === '' ? toText(s.headerLines) : t))
        setFooterText((t) => (t === '' ? toText(s.footerLines) : t))
      }),
    [],
  )

  const effective: ReceiptSettings | null = draft && { ...draft, headerLines: toLines(headerText), footerLines: toLines(footerText) }

  // Arzon tekshiruv — har renderda qayta hisoblanadi.
  const problem = (() => {
    if (!effective) return null
    if (effective.title.trim().length > RECEIPT_LIMITS.title) return `Sarlavha ${RECEIPT_LIMITS.title} belgidan oshmasin`
    if (effective.headerLines.length > RECEIPT_LIMITS.headerLines) return `Yuqori qatorlar ${RECEIPT_LIMITS.headerLines} tadan oshmasin`
    if (effective.footerLines.length > RECEIPT_LIMITS.footerLines) return `Pastki qatorlar ${RECEIPT_LIMITS.footerLines} tadan oshmasin`
    if ([...effective.headerLines, ...effective.footerLines].some((l) => l.length > RECEIPT_LIMITS.line)) {
      return `Har bir qator ${RECEIPT_LIMITS.line} belgidan oshmasin`
    }
    return null
  })()

  const dirty = !!current && !!effective && JSON.stringify(current) !== JSON.stringify({ ...effective, title: effective.title.trim() })

  const mutation = useMutation({
    mutationFn: () => updateReceiptSettings({ ...effective!, title: effective!.title.trim() }),
    onSuccess: () => {
      setSaved(true)
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Saqlab bo'lmadi"),
  })

  const update = (patch: Partial<ReceiptSettings>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setSaved(false)
  }

  const preview = effective ? layoutReceipt(sampleReceipt(effective), paper === 58 ? 32 : 48) : []

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
        <Printer size={18} className="text-brand-primary" />
        Chek ko'rinishi
      </h2>
      <p className="mb-4 text-xs text-gray-dark">
        Ilova Bluetooth printerda chiqaradigan chek. Termal printer faqat oddiy lotin harflarini ishonchli chiqaradi — maxsus
        belgilar avtomatik almashtiriladi. Chek chiqarish vakolati Xodimlar sahifasida beriladi.
      </p>

      {!draft || !effective ? (
        <Spinner className="py-6" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-gray-dark">Sarlavha (katta harfda chiqadi)</span>
              <input
                value={draft.title}
                maxLength={RECEIPT_LIMITS.title}
                onChange={(e) => update({ title: e.target.value })}
                className="mt-1 block h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-bold text-ink outline-none focus:border-brand-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-dark">
                Yuqori qatorlar — telefon, manzil, ijtimoiy tarmoq (har biri yangi qatorda)
              </span>
              <textarea
                value={headerText}
                rows={4}
                placeholder={'Tel: +998 90 000 00 00\nManzil: ...\nInstagram: @seltacleaning'}
                onChange={(e) => {
                  setHeaderText(e.target.value)
                  setSaved(false)
                }}
                className="mt-1 block w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-dark">Pastki qatorlar (oxirida chiqadi)</span>
              <textarea
                value={footerText}
                rows={3}
                onChange={(e) => {
                  setFooterText(e.target.value)
                  setSaved(false)
                }}
                className="mt-1 block w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand-primary"
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TOGGLES.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={draft[t.key] as boolean}
                    onChange={(e) => update({ [t.key]: e.target.checked } as Partial<ReceiptSettings>)}
                    className="h-4 w-4 shrink-0 accent-brand-primary"
                  />
                  <span className="min-w-0 text-xs font-semibold text-ink">{t.label}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => mutation.mutate()}
                disabled={!dirty || !!problem || mutation.isPending}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Check size={15} />
                {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
              <button
                onClick={() => {
                  setDraft(DEFAULT_RECEIPT_SETTINGS)
                  setHeaderText('')
                  setFooterText(toText(DEFAULT_RECEIPT_SETTINGS.footerLines))
                  setSaved(false)
                }}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold text-gray-dark hover:text-ink"
              >
                <RotateCcw size={15} />
                Standart
              </button>
              {problem && <span className="text-xs font-bold text-danger">{problem}</span>}
              {saved && !dirty && <span className="text-xs font-bold text-success">Saqlandi</span>}
              {error && <span className="text-xs font-bold text-danger">{error}</span>}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-dark">Namuna</span>
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
            <div className="overflow-x-auto rounded-xl bg-bg p-3">
              <div className="mx-auto w-fit rounded-md bg-white px-4 py-5 shadow-md">
                {preview.map((line, i) =>
                  line.logo ? (
                    <div key={i} className="mb-2 text-center font-heading text-lg font-extrabold tracking-wide text-ink">
                      [ LOGOTIP ]
                    </div>
                  ) : (
                    <pre
                      key={i}
                      className={`m-0 whitespace-pre font-mono leading-snug text-black ${line.bold ? 'font-bold' : ''} ${
                        line.large ? 'text-[15px]' : 'text-[11px]'
                      }`}
                      style={line.large ? { letterSpacing: '0.1em' } : undefined}
                    >
                      {line.text || ' '}
                    </pre>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

import { Suspense, lazy, useState } from 'react'
import { X, MapPin, Check } from 'lucide-react'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { Spinner } from '@/components/ui/Spinner'

// Leaflet (+ CSS va marker rasmlari) ~140KB — u faqat admin xaritani
// ochganda yuklanadi, Davomat sahifasining o'zi tez ochilishi uchun.
const LocationMapPicker = lazy(() =>
  import('./LocationMapPicker').then((m) => ({ default: m.LocationMapPicker })),
)

/**
 * Talab: xarita sahifada doim turmasin, alohida tugma orqali ochilsin.
 * Modal ichida tanlangan nuqta faqat "Tasdiqlash"da qo'llanadi — admin
 * xatoli bosib qo'ysa, "Bekor qilish" bilan eski qiymat saqlanib qoladi.
 */
export function LocationPickerModal({
  initial,
  radiusMeters,
  onApply,
  onClose,
}: {
  initial: { lat: number; lng: number } | null
  radiusMeters: number
  onApply: (coords: { lat: number; lng: number }) => void
  onClose: () => void
}) {
  useEscapeClose(onClose)
  const [draft, setDraft] = useState(initial)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-brand-primary" />
            <div>
              <h2 className="font-heading font-bold text-ink">Ishxona joylashuvi</h2>
              <p className="text-xs text-gray-dark">Xaritani bosib nuqtani belgilang</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-dark hover:bg-bg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<Spinner className="py-20" />}>
            <LocationMapPicker value={draft} onChange={setDraft} radiusMeters={radiusMeters} />
          </Suspense>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-ink">Kenglik (lat)</label>
              <input
                type="number"
                step="any"
                value={draft?.lat ?? ''}
                onChange={(e) => setDraft((p) => ({ lat: Number(e.target.value), lng: p?.lng ?? 0 }))}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-ink">Uzunlik (lng)</label>
              <input
                type="number"
                step="any"
                value={draft?.lng ?? ''}
                onChange={(e) => setDraft((p) => ({ lat: p?.lat ?? 0, lng: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-ink hover:bg-bg">
            Bekor qilish
          </button>
          <button
            onClick={() => {
              if (draft) onApply(draft)
              onClose()
            }}
            disabled={!draft}
            className="flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            <Check size={16} />
            Tasdiqlash
          </button>
        </div>
      </div>
    </div>
  )
}

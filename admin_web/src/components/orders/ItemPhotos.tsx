import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api'
import { formatDateTimeUz } from '@/lib/date-utils'
import { PHOTO_STATE_LABELS as STATE_LABELS, type ItemPhoto, type ItemPhotos, type PhotoState } from '@/lib/item-photos'

/** Ilova bilan BIR XIL kichik nusxa — ImageKit uni bir marta tayyorlaydi. */
function thumbUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}tr=w-400,h-400,c-at_max,q-70`
}

interface Entry {
  state: PhotoState
  index: number
  total: number
  photo: ItemPhoto
}

/** Mahsulot qatoridagi kichik rasmlar; bosilsa katta ko'rinish. */
export function ItemPhotoStrip({ orderId, itemId, photos }: { orderId: string; itemId: string; photos: ItemPhotos }) {
  const [open, setOpen] = useState<number | null>(null)
  const entries: Entry[] = (['before', 'ready'] as const).flatMap((state) =>
    photos[state].map((photo, i) => ({ state, index: i + 1, total: photos[state].length, photo })),
  )
  if (entries.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {(['before', 'ready'] as const).map((state) =>
        photos[state].length === 0 ? null : (
          <div key={state} className="min-w-0">
            <p className={`mb-1 text-[11px] font-bold ${state === 'before' ? 'text-warning' : 'text-success'}`}>
              {STATE_LABELS[state]}
            </p>
            <div className="flex gap-1.5">
              {photos[state].map((photo) => {
                const index = entries.findIndex((e) => e.photo.fileId === photo.fileId)
                return (
                  <button
                    key={photo.fileId}
                    onClick={() => setOpen(index)}
                    className="h-14 w-14 overflow-hidden rounded-lg border border-border bg-bg hover:ring-2 hover:ring-brand-primary/40"
                    aria-label={`${STATE_LABELS[state]} — rasmni ochish`}
                  >
                    <img src={thumbUrl(photo.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                )
              })}
            </div>
          </div>
        ),
      )}
      {open !== null && entries[open] && (
        <PhotoLightbox
          orderId={orderId}
          itemId={itemId}
          entries={entries}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function PhotoLightbox({
  orderId,
  itemId,
  entries,
  index,
  onIndex,
  onClose,
}: {
  orderId: string
  itemId: string
  entries: Entry[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = entries[index]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (e.key === 'ArrowRight' && index < entries.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, entries.length, onClose, onIndex])

  async function remove() {
    if (!window.confirm("Rasmni o'chirasizmi? U barcha xodimlar uchun o'chadi.")) return
    setDeleting(true)
    setError(null)
    try {
      await apiPost('/deleteItemPhoto', { orderId, itemId, state: current.state, fileId: current.photo.fileId })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rasmni o'chirib bo'lmadi")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {STATE_LABELS[current.state]} · {current.index}/{current.total}
          </p>
          <p className="truncate text-xs text-white/70">
            {[current.photo.uploadedByName, current.photo.uploadedAt && formatDateTimeUz(current.photo.uploadedAt)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          onClick={remove}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50"
        >
          <Trash2 size={16} />
          {deleting ? "O'chirilmoqda…" : "O'chirish"}
        </button>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Yopish">
          <X size={20} />
        </button>
      </div>
      {error && <p className="px-4 text-sm font-semibold text-red-300">{error}</p>}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <img
          src={current.photo.url}
          alt={STATE_LABELS[current.state]}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onIndex(index - 1)
            }}
            className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Oldingi"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {index < entries.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onIndex(index + 1)
            }}
            className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Keyingi"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  )
}

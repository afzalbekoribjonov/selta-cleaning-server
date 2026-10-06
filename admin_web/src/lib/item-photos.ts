import type { Timestamp } from 'firebase/firestore'

/** Mahsulot rasmlari — ilova olgan "eski" va "tayyor" holat (server: routes/photos.ts). */
export type PhotoState = 'before' | 'ready'

export interface ItemPhoto {
  fileId: string
  url: string
  uploadedByName: string | null
  uploadedAt: Date | null
}

export type ItemPhotos = Record<PhotoState, ItemPhoto[]>

export const PHOTO_STATE_LABELS: Record<PhotoState, string> = { before: 'Eski holati', ready: 'Tayyor holati' }

export function photosOf(raw: unknown): ItemPhotos {
  const r = (raw ?? {}) as Record<string, unknown>
  const list = (value: unknown): ItemPhoto[] =>
    Array.isArray(value)
      ? value
          .filter((p) => p && typeof p.fileId === 'string' && typeof p.url === 'string')
          .map((p) => ({
            fileId: p.fileId as string,
            url: p.url as string,
            uploadedByName: (p.uploadedByName as string | undefined) ?? null,
            uploadedAt: (p.uploadedAt as Timestamp | undefined)?.toDate?.() ?? null,
          }))
      : []
  return { before: list(r.before), ready: list(r.ready) }
}

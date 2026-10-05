/**
 * Mahsulot rasmlari — mahsulot hujjatidagi `photos` maydoni:
 * `{ before: ItemPhoto[], ready: ItemPhoto[] }` ("eski" va "tayyor" holat).
 * Buyurtmadagi mahsulotlar nusxasiga (itemsMirror) ham tushadi — shu
 * tufayli ilova rasmlar ro'yxatini qo'shimcha o'qishsiz va internetsiz
 * ham ko'rsatadi.
 */
export const PHOTO_STATES = ["before", "ready"] as const;
export type PhotoState = (typeof PHOTO_STATES)[number];

/** Har bir holat uchun ko'pi bilan shuncha rasm. */
export const MAX_PHOTOS_PER_STATE = 2;

/** Yuklangan rasm hajmi chegarasi (ilova ~200-400 KB qilib siqadi). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export interface ItemPhoto {
  fileId: string;
  url: string;
  width?: number;
  height?: number;
  size?: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: unknown;
}

export type ItemPhotos = Record<PhotoState, ItemPhoto[]>;

export function isPhotoState(value: unknown): value is PhotoState {
  return typeof value === "string" && (PHOTO_STATES as readonly string[]).includes(value);
}

/** Bazadagi qiymatni ishonchli shaklga keltiradi (buzilgan yozuvlar tashlanadi). */
export function photosOf(item: Record<string, unknown> | undefined): ItemPhotos {
  const raw = (item?.photos ?? {}) as Record<string, unknown>;
  const list = (value: unknown): ItemPhoto[] =>
    Array.isArray(value)
      ? value.filter(
          (p): p is ItemPhoto =>
            !!p && typeof p === "object" && typeof (p as ItemPhoto).fileId === "string" && typeof (p as ItemPhoto).url === "string",
        )
      : [];
  return { before: list(raw.before), ready: list(raw.ready) };
}

export function photoFileIdsOf(item: Record<string, unknown> | undefined): string[] {
  const photos = photosOf(item);
  return PHOTO_STATES.flatMap((state) => photos[state].map((p) => p.fileId));
}

/** Rasm qaysi holatda turgani (yo'q bo'lsa `null`). */
export function stateOfPhoto(photos: ItemPhotos, fileId: string): PhotoState | null {
  return PHOTO_STATES.find((state) => photos[state].some((p) => p.fileId === fileId)) ?? null;
}

/** Firestore hujjat ID'lari (avtomatik ID 20 belgi) — yo'lga zarar keltiradigan belgilarsiz. */
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

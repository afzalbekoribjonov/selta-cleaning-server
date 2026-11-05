import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";

/**
 * Mahsulot o'zgarish tarixi — buyurtma ichidagi `itemEvents` jamlanmasi
 * (`orders/{id}/itemEvents`). Har bir mahsulot bilan bog'liq amal SHU
 * YERDA, o'sha tranzaksiyaning o'zida yoziladi: qo'shildi, o'lchami/narxi/
 * tarifi o'zgardi, holati o'zgardi (yuvish → upakovka → tayyor →
 * yetkazildi, sifatdan qaytdi), rasm qo'shildi/o'chirildi, o'chirildi.
 *
 * Admin paneli buyurtma kartasida har bir mahsulot uchun alohida tarixni
 * shu yozuvlardan ko'rsatadi. Xodim ismi ATAYLAB saqlanmaydi (o'zgarishi
 * mumkin) — panel uni `employeeId` orqali bog'laydi (dailyActivity kabi).
 *
 * Takroriy so'rovlar (ilovaning oflayn navbati) tarixni ikki marta
 * yozmaydi: har bir yo'l takrorni yozuvlardan OLDIN to'xtatadi.
 */
export type ItemEventType = "created" | "updated" | "status" | "deleted" | "photo_added" | "photo_removed";

export interface ItemFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ItemEventInput {
  type: ItemEventType;
  itemId: string;
  itemNumber: number | null;
  itemName: string;
  employeeId: string;
  role?: string | null;
  /** Nazoratchi boshqa xodim nomidan qayd etgan bo'lsa — nazoratchi. */
  recordedBy?: string | null;
  /** `updated` — qaysi maydon nimadan nimaga o'zgardi. */
  changes?: ItemFieldChange[];
  /** `created`/`deleted` — o'sha paytdagi asosiy maydonlar. */
  snapshot?: Record<string, unknown>;
  fromStatus?: string | null;
  toStatus?: string | null;
  /** Sifat nazorati izohi (qaytarilganda) va h.k. */
  note?: string | null;
  /** Yetkazishda shu mahsulot uchun olingan summa. */
  amount?: number | null;
  /** Rasm: "before" (eski) yoki "ready" (tayyor). */
  photoState?: string | null;
}

/** Tarixda kuzatiladigan maydonlar — panel ularni o'qiladigan nom bilan ko'rsatadi. */
export const TRACKED_ITEM_FIELDS = [
  "name",
  "calcType",
  "width",
  "height",
  "qty",
  "sizeVariant",
  "condition",
  "tariff",
  "price",
] as const;

function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Math.round(value * 100) / 100;
  return value;
}

/** Mahsulotning kuzatiladigan maydonlari (bo'shlari tashlanadi). */
export function itemSnapshot(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of TRACKED_ITEM_FIELDS) {
    const value = normalize(item[field]);
    if (value !== null) out[field] = value;
  }
  return out;
}

/** Tahrirlashda nima o'zgargani — o'zgarmagan maydonlar kirmaydi. */
export function diffItem(before: Record<string, unknown>, after: Record<string, unknown>): ItemFieldChange[] {
  const changes: ItemFieldChange[] = [];
  for (const field of TRACKED_ITEM_FIELDS) {
    if (!(field in after)) continue;
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

interface Writer {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
}

/**
 * Tarix yozuvini tranzaksiya yoki to'plam ichida qo'shadi.
 *
 * [at] — vaqtni hodisa qatorida bir xil tartiblash uchun. Berilmasa server
 * vaqti; bitta amaldagi bir nechta yozuvga (masalan bir nechta mahsulot
 * yetkazilgani) bir xil vaqt berish mumkin.
 */
export function recordItemEvent(writer: Writer, orderRef: DocumentReference, input: ItemEventInput, at?: Date) {
  const doc: Record<string, unknown> = {
    type: input.type,
    itemId: input.itemId,
    itemNumber: input.itemNumber,
    itemName: input.itemName || "Mahsulot",
    by: input.employeeId,
    at: at ? Timestamp.fromDate(at) : FieldValue.serverTimestamp(),
  };
  if (input.role) doc.role = input.role;
  if (input.recordedBy) doc.recordedBy = input.recordedBy;
  if (input.changes && input.changes.length > 0) doc.changes = input.changes;
  if (input.snapshot && Object.keys(input.snapshot).length > 0) doc.snapshot = input.snapshot;
  if (input.fromStatus !== undefined) doc.fromStatus = input.fromStatus ?? null;
  if (input.toStatus !== undefined) doc.toStatus = input.toStatus ?? null;
  if (input.note) doc.note = input.note;
  if (typeof input.amount === "number") doc.amount = Math.round(input.amount);
  if (input.photoState) doc.photoState = input.photoState;
  writer.set(orderRef.collection("itemEvents").doc(), doc);
}

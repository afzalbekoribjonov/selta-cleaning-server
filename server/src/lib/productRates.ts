import { db } from "./admin";

/**
 * Ishbay narxlari — MAHSULOT bo'yicha (Mahsulotlar bo'limida bir marta
 * kiritiladi), xodim bo'yicha emas. Har bir mahsulot uchun 1 birlik
 * (m², metr, kg yoki dona — mahsulot hisoblash turiga qarab) yuvish va
 * qadoqlash narxi. Xodimga faqat usul (kasbi) belgilanadi: ishbay
 * usulidagi xodim o'zi yuvgan va qadoqlagan hajm × shu narxlarni oladi.
 *
 * Avval narx har bir xodimda faqat m² uchun edi — metr, kg va dona
 * mahsulotlar uchun ishbay hisoblanmasdi.
 */
export interface WorkRates {
  /** 1 birlik yuvish narxi (so'm). */
  wash: number | null;
  /** 1 birlik qadoqlash narxi (so'm). */
  pack: number | null;
}

export interface ProductRates {
  byId: Map<string, WorkRates>;
  /** Eski jurnal yozuvlarida productId yo'q — nom bo'yicha topiladi. */
  byName: Map<string, WorkRates>;
}

export type RateStage = "wash" | "pack";

export const MAX_WORK_RATE = 10_000_000;

export const normalizeProductName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

const TTL_MS = 60_000;
let cache: { at: number; rates: ProductRates } | null = null;

export function invalidateProductRates(): void {
  cache = null;
}

function cleanRate(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export function ratesFromDocs(docs: { id: string; data: Record<string, unknown> }[]): ProductRates {
  const byId = new Map<string, WorkRates>();
  const byName = new Map<string, WorkRates>();
  for (const { id, data } of docs) {
    const raw = (data.workRates ?? {}) as Record<string, unknown>;
    const rates: WorkRates = { wash: cleanRate(raw.wash), pack: cleanRate(raw.pack) };
    byId.set(id, rates);
    if (typeof data.name === "string" && data.name.trim()) byName.set(normalizeProductName(data.name), rates);
  }
  return { byId, byName };
}

/** Katalog kichik (o'nlab hujjat) — bitta so'rov, 1 daqiqa keshlanadi. */
export async function loadProductRates(): Promise<ProductRates> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rates;
  const snap = await db.collection("products").get();
  const rates = ratesFromDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
  cache = { at: Date.now(), rates };
  return rates;
}

export const EMPTY_RATES: ProductRates = { byId: new Map(), byName: new Map() };

/** Qator uchun 1 birlik narxi; belgilanmagan bo'lsa — null. */
export function rateFor(rates: ProductRates, line: { productId?: string | null; name: string }, stage: RateStage): number | null {
  const r = (line.productId ? rates.byId.get(line.productId) : undefined) ?? rates.byName.get(normalizeProductName(line.name));
  return r?.[stage] ?? null;
}

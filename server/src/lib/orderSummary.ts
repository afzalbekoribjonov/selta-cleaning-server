import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * Buyurtma kartalari/ro'yxatlari uchun mahsulotlardan HOSILA qilingan
 * ma'lumot — buyurtma hujjatining o'ziga yozib qo'yiladi.
 *
 * NEGA KERAK: pickup buyurtmalarda tarif, muddat va holat ITEM darajasida.
 * Avval har bir ro'yxat (admin, sotuv_web, workers_web, mobil kartalar)
 * ko'rsatish uchun HAR BIR buyurtmaning `items` pastki jamlanmasiga
 * alohida obuna ochardi. 100-400 ta faol buyurtmada bu bir ochilishda
 * minglab o'qish degani edi va Firestore kunlik limitini tugatib qo'ydi.
 *
 * Endi bu qiymatlar mahsulot o'zgargan PAYTDA (yozishda, ya'ni kamdan-kam)
 * bir marta hisoblanadi va ro'yxatlar mahsulotlarni umuman o'qimaydi.
 *
 * MUHIM: mahsulotlarni o'zgartiradigan HAR BIR yo'l shu summarini qayta
 * yozishi shart, aks holda ma'lumot eskirib qoladi. Hozircha bular:
 * createOrder, addOrderItems, updateOrderItem, deleteOrderItem,
 * changeItemStatus, deliverOrderItems.
 */

/**
 * Bitta mahsulot — `id` va hujjatdagi TO'LIQ ma'lumot (faqat hisob uchun
 * kerakli maydonlar emas): undan buyurtmadagi mahsulotlar nusxasi
 * (`itemsMirror`) ham quriladi.
 */
export interface SummaryItemInput {
  id: string;
  status?: string | null;
  tariff?: string | null;
  dueDate?: Timestamp | Date | null;
  price?: number | null;
  category?: string | null;
  calcType?: string | null;
  qty?: number | null;
  [field: string]: unknown;
}

/** Firestore hujjatidan — `{ id, ...data }`. */
export function summaryItemOf(doc: FirebaseFirestore.DocumentSnapshot, patch: Record<string, unknown> = {}): SummaryItemInput {
  return { ...(doc.data() ?? {}), ...patch, id: doc.id } as SummaryItemInput;
}

/**
 * Buyurtmadagi mahsulotlar NUSXASI uchun olinadigan maydonlar — ilova va
 * veb ekranlari mahsulot kartasida ko'rsatadiganlari.
 */
const MIRROR_FIELDS = [
  "itemNumber",
  "name",
  "area",
  "price",
  "qcStatus",
  "qcNote",
  "productId",
  "calcType",
  "category",
  "width",
  "height",
  "qty",
  "sizeVariant",
  "unitPrice",
  "condition",
  "conditionSurchargePercent",
  "tariff",
  "dueDate",
  "createdAt",
  "status",
  "addedByDepartment",
  "washedBy",
  "washedAt",
  "packedBy",
  "packedAt",
  "deliveredBy",
  "deliveredAt",
  "deliveredByName",
  "collectedAmount",
  "photos",
] as const;

/**
 * Nusxaga yoziladigan qiymat. Massiv ichida Firestore belgilari
 * (`serverTimestamp()` va h.k.) TAQIQLANGAN — vaqt belgisi shu paytga
 * aylantiriladi, qolganlari tushirib qoldiriladi.
 */
function mirrorValue(value: unknown, now: Timestamp): unknown {
  if (value === undefined) return undefined;
  if (value instanceof FieldValue) return value.isEqual(FieldValue.serverTimestamp()) ? now : undefined;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return value;
}

/**
 * Buyurtma hujjatidagi mahsulotlar nusxasi (`itemsMirror`).
 *
 * NEGA: ilova buyurtmalar ro'yxatini qurilmada keshlaydi, lekin har bir
 * buyurtmaning `items` pastki jamlanmasi alohida so'rov — xodim oldin
 * ochmagan buyurtmaning mahsulotlari internetsiz umuman chiqmasdi va har
 * bir ochilish qo'shimcha o'qish edi. Nusxa buyurtma bilan BIRGA keladi:
 * mahsulotlar darhol, internetsiz ham ko'rinadi, qo'shimcha o'qishsiz.
 *
 * Mahsulotni o'zgartiradigan har bir yo'l summarini (demak nusxani ham)
 * shu tranzaksiyada qayta yozadi, shuning uchun ikkalasi hech qachon
 * bir-biridan farq qilmaydi.
 */
export function buildItemsMirror(items: SummaryItemInput[]): Record<string, unknown>[] {
  const now = Timestamp.now();
  return [...items]
    .sort((a, b) => (Number(a.itemNumber) || 0) - (Number(b.itemNumber) || 0))
    .map((item) => {
      const entry: Record<string, unknown> = { id: item.id };
      for (const field of MIRROR_FIELDS) {
        const value = mirrorValue(item[field], now);
        if (value !== undefined && value !== null) entry[field] = value;
      }
      return entry;
    });
}

/**
 * Hisoblash turi -> o'lchov birligi. O'lchovsiz turlar ("size"/"fixed")
 * donada sanaladi, shuning uchun ular uchun har bir mahsulot 1 birlik.
 */
export const UNIT_BY_CALC_TYPE: Record<string, string> = {
  sqm: "sqm",
  meter: "meter",
  kg: "kg",
  count: "dona",
  size: "dona",
  fixed: "dona",
};

/** O'lchovli tur bo'lsa mahsulotning haqiqiy hajmi, aks holda 1 dona. */
export function unitAmountOf(calcType: string | null | undefined, qty: number | null | undefined): number {
  const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
  if (unit === "dona") return 1;
  return Number(qty) || 0;
}

/** Toifasi belgilanmagan mahsulot uchun kalit — `null` massivda saqlanmaydi. */
export const NO_CATEGORY = "_none";

export interface OrderItemsSummary {
  itemCount: number;
  /** Takrorlanmagan tariflar — ro'yxatdagi rangli nuqtalar uchun. */
  itemTariffs: string[];
  /** Yakunlanmagan mahsulotlar orasidagi eng yaqin muddat. */
  earliestPendingDueDate: Timestamp | null;
  /** Narxi 0 (hali o'lchanmagan), yakunlanmagan mahsulotlar soni. */
  zeroPriceItemCount: number;
  /** Har bir bosqichda nechta mahsulot borligi — ishchi ustunlari uchun. */
  itemStatusCounts: Record<string, number>;
  /**
   * Birlik bo'yicha umumiy hajm ({ sqm: 12.5, kg: 3, dona: 2 }) — kunlik
   * hisobotdagi "Bugun sexga qancha hajm keldi" ko'rsatkichi buni
   * mahsulotlarni umuman o'qimasdan yig'ishi uchun.
   */
  itemUnitTotals: Record<string, number>;
  /**
   * Har bir bosqichda qanday TOIFADAGI mahsulotlar borligi. Ishchi
   * ro'yxati mutaxassislik bo'yicha filtrlanadi — busiz klient buni
   * bilish uchun har bir buyurtmaning mahsulotlarini o'qishga majbur
   * bo'lardi.
   */
  itemStageCategories: Record<string, string[]>;
  /** Mahsulotlar nusxasi — [buildItemsMirror]. */
  itemsMirror: Record<string, unknown>[];
}

function toTimestamp(value: Timestamp | Date | null | undefined): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return null;
}

export function computeOrderItemsSummary(items: SummaryItemInput[]): OrderItemsSummary {
  const tariffs = new Set<string>();
  const statusCounts: Record<string, number> = {};
  const stageCategories: Record<string, Set<string>> = {};
  const unitTotals: Record<string, number> = {};
  let earliest: Timestamp | null = null;
  let zeroPrice = 0;

  for (const item of items) {
    const status = item.status ?? null;
    if (status) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      (stageCategories[status] ??= new Set()).add(item.category ?? NO_CATEGORY);
    }
    if (item.tariff) tariffs.add(item.tariff);

    const unit = UNIT_BY_CALC_TYPE[item.calcType ?? "fixed"] ?? "dona";
    unitTotals[unit] = (unitTotals[unit] ?? 0) + unitAmountOf(item.calcType, item.qty);

    const isDone = status === "done";
    if (!isDone) {
      const due = toTimestamp(item.dueDate);
      if (due && (earliest === null || due.toMillis() < earliest.toMillis())) {
        earliest = due;
      }
      if (!(Number(item.price) > 0)) zeroPrice += 1;
    }
  }

  return {
    itemCount: items.length,
    itemUnitTotals: Object.fromEntries(
      Object.entries(unitTotals).map(([unit, amount]) => [unit, Math.round(amount * 100) / 100]),
    ),
    itemTariffs: [...tariffs],
    earliestPendingDueDate: earliest,
    zeroPriceItemCount: zeroPrice,
    itemStatusCounts: statusCounts,
    itemStageCategories: Object.fromEntries(
      Object.entries(stageCategories).map(([status, set]) => [status, [...set]]),
    ),
    itemsMirror: buildItemsMirror(items),
  };
}

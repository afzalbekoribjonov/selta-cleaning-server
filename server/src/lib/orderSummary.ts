import { Timestamp } from "firebase-admin/firestore";

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
 * changeItemStatus.
 */

export interface SummaryItemInput {
  status?: string | null;
  tariff?: string | null;
  dueDate?: Timestamp | Date | null;
  price?: number | null;
  category?: string | null;
  calcType?: string | null;
  qty?: number | null;
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
  };
}

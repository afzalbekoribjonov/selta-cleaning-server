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
  let earliest: Timestamp | null = null;
  let zeroPrice = 0;

  for (const item of items) {
    const status = item.status ?? null;
    if (status) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      (stageCategories[status] ??= new Set()).add(item.category ?? NO_CATEGORY);
    }
    if (item.tariff) tariffs.add(item.tariff);

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
    itemTariffs: [...tariffs],
    earliestPendingDueDate: earliest,
    zeroPriceItemCount: zeroPrice,
    itemStatusCounts: statusCounts,
    itemStageCategories: Object.fromEntries(
      Object.entries(stageCategories).map(([status, set]) => [status, [...set]]),
    ),
  };
}

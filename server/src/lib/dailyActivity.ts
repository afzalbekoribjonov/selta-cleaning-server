import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";
import { businessDateString } from "./businessTime";

/**
 * Kunlik faoliyat jurnali — "aynan bugun nima bo'ldi" savoliga javob
 * beradigan o'zgarmas hodisalar oqimi.
 *
 * NEGA KERAK: "bugun nechta mahsulot yuvildi / upakovka qilindi /
 * yetkazildi" ko'rsatkichini mahsulotlarning o'zidan hisoblash uchun
 * `items` bo'ylab collection-group so'rov (har bir vaqt maydoni uchun
 * alohida collection-group indeks) yoki BARCHA faol buyurtmalarning
 * mahsulotlarini o'qish kerak bo'lardi. Ikkalasi ham qimmat, ikkinchisi
 * esa O'TGAN kunlar uchun umuman ishlamaydi (buyurtma keyinroq
 * o'zgarsa, `updatedAt` oynasidan chiqib ketadi).
 *
 * Shuning uchun har bir tugallangan bosqich SHU YERDA, o'zgarish
 * paytida, bir marta yozib qo'yiladi. Bitta kunning hisoboti — bitta
 * jamlanma so'rovi (`dailyActivity/{2026-09-05}/events`), qo'shimcha
 * indekssiz va istalgan o'tgan kun uchun ishlaydi.
 *
 * Hodisalar O'ZGARMAS: keyinchalik buyurtma tahrirlansa ham, o'sha
 * kungi hisobot o'sha kuni haqiqatan nima bo'lganini ko'rsatadi.
 * Xodim ismi ataylab saqlanmaydi — u o'zgarishi mumkin, shuning uchun
 * hisobot uni `employees` dan o'qib bog'laydi (hisobot chaqirilganda
 * bir marta).
 */
export type DailyActivityType = "washed" | "packed" | "delivered" | "onsite_done";

export interface DailyActivityInput {
  type: DailyActivityType;
  orderId: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  serviceType: string;
  /** Amalni bajargan xodim (server tomonidan tasdiqlangan). */
  employeeId: string;
  itemId?: string | null;
  itemNumber?: number | null;
  itemName?: string | null;
  /** O'lchov turi ("sqm" / "kg" / ...) — hajmni birlik bo'yicha yig'ish uchun. */
  calcType?: string | null;
  qty?: number | null;
  price?: number | null;
  /** Dastavchik mijozdan olgan summa, agar alohida kiritilgan bo'lsa. */
  collectedAmount?: number | null;
}

/**
 * Hodisani tranzaksiya ichida yozadi. `at` — chaqiruvchi ushlab turgan
 * bitta payt: kun kaliti ham, vaqt shtampi ham SHU qiymatdan olinadi,
 * shuning uchun yarim tundagi hodisa ikki xil kunga tushib qolmaydi.
 */
export function logDailyActivity(tx: Transaction, at: Date, event: DailyActivityInput): void {
  const dateKey = businessDateString(at);
  const ref = db.collection("dailyActivity").doc(dateKey).collection("events").doc();
  tx.set(ref, {
    ...event,
    itemId: event.itemId ?? null,
    itemNumber: event.itemNumber ?? null,
    itemName: event.itemName ?? null,
    calcType: event.calcType ?? null,
    qty: event.qty ?? null,
    price: event.price ?? null,
    collectedAmount: event.collectedAmount ?? null,
    dateKey,
    at: Timestamp.fromDate(at),
  });
}

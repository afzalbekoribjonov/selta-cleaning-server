import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";
import { businessDateString } from "./businessTime";

/**
 * Kunlik faoliyat jurnali — "aynan shu kuni nima bo'ldi" savoliga javob
 * beradigan hodisalar oqimi.
 *
 * NEGA KERAK: "bugun nechta mahsulot yuvildi / upakovka qilindi /
 * yetkazildi" ko'rsatkichini mahsulotlarning o'zidan hisoblash uchun
 * `items` bo'ylab collection-group so'rov (har bir vaqt maydoni uchun
 * alohida collection-group indeks) yoki BARCHA buyurtmalarning
 * mahsulotlarini o'qish kerak bo'lardi. Ikkalasi ham qimmat.
 *
 * Shuning uchun har bir tugallangan bosqich SHU YERDA, o'zgarish
 * paytida, bir marta yozib qo'yiladi. Bitta kunning hisoboti — bitta
 * jamlanma so'rovi (`dailyActivity/{2026-09-05}/events`), qo'shimcha
 * indekssiz va istalgan o'tgan kun uchun ishlaydi.
 *
 * Xodim ismi ataylab saqlanmaydi — u o'zgarishi mumkin, shuning uchun
 * hisobot uni `employees` dan o'qib bog'laydi.
 *
 * Hujjat ID'si ATAYLAB aniqlangan (tasodifiy emas): `tur__manba__kun`.
 * Shu tufayli eski buyurtmalardan qayta to'ldirish (backfill) jonli
 * yozilgan hodisa bilan to'qnashmaydi — ustiga yozadi, ikki marta
 * sanalmaydi. Yon ta'siri: bitta mahsulot BIR KUNNING o'zida ikki
 * marta yuvilsa (sifat nazoratidan qaytib, o'sha kuni qayta yuvilsa)
 * kunlik hisobda bir marta sanaladi — bu ataylab, chunki savol "bugun
 * nechta mahsulot yuvildi", "nechta yuvish amali bo'ldi" emas.
 */
export type DailyActivityType = "washed" | "packed" | "delivered" | "onsite_done" | "settled";

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
  /**
   * Shu summaning naqd va karta ulushlari. Berilmasa `null` yoziladi va
   * o'quvchi uni "hammasi naqd" deb talqin qiladi — maydonlar joriy
   * etilishidan oldingi yozuvlar bilan bir xil ma'no.
   */
  cashAmount?: number | null;
  cardAmount?: number | null;
  /**
   * `settled` hodisasi uchun yopilgan to'lov yozuvi. Hodisa mahsulotga
   * emas, to'lovga tegishli — ID shu maydondan quriladi.
   */
  paymentId?: string | null;
}

/** Berilgan kunning hodisalari jamlanmasi. */
export function dailyActivityEvents(dateKey: string) {
  return db.collection("dailyActivity").doc(dateKey).collection("events");
}

/** `tur__manba__kun` — bir xil hodisa uchun har doim bir xil ID. */
export function dailyActivityDocId(event: DailyActivityInput, dateKey: string): string {
  return `${event.type}__${event.paymentId ?? event.itemId ?? event.orderId}__${dateKey}`;
}

/** Hodisa hujjatining tarkibi — jonli yozuv ham, backfill ham shuni ishlatadi. */
export function buildDailyActivityDoc(at: Date, event: DailyActivityInput) {
  return {
    ...event,
    itemId: event.itemId ?? null,
    itemNumber: event.itemNumber ?? null,
    itemName: event.itemName ?? null,
    calcType: event.calcType ?? null,
    qty: event.qty ?? null,
    price: event.price ?? null,
    collectedAmount: event.collectedAmount ?? null,
    cashAmount: event.cashAmount ?? null,
    cardAmount: event.cardAmount ?? null,
    paymentId: event.paymentId ?? null,
    dateKey: businessDateString(at),
    at: Timestamp.fromDate(at),
  };
}

/**
 * Hodisani tranzaksiya ichida yozadi. `at` — chaqiruvchi ushlab turgan
 * bitta payt: kun kaliti ham, vaqt shtampi ham SHU qiymatdan olinadi,
 * shuning uchun yarim tundagi hodisa ikki xil kunga tushib qolmaydi.
 */
export function logDailyActivity(tx: Transaction, at: Date, event: DailyActivityInput): void {
  const dateKey = businessDateString(at);
  const ref = dailyActivityEvents(dateKey).doc(dailyActivityDocId(event, dateKey));
  tx.set(ref, buildDailyActivityDoc(at, event));
}

/**
 * Shu mahsulot uchun jurnalda mavjud bo'lishi mumkin bo'lgan yozuvlar.
 *
 * Yozuv hodisa paytidagi narx/hajm nusxasini saqlaydi. Agar mahsulot
 * keyinchalik qayta o'lchanib narxi to'g'rilansa (masalan 31 000 dan
 * 312 000 ga), jurnal eski qiymatda qolib ketardi va kunlik hisobotda
 * buyurtma summasi bilan mos kelmasdi. Shu funksiya orqali tahrirlash
 * va o'chirish yo'llari o'z yozuvlarini ham yangilaydi.
 *
 * `packed` uchun eski mahsulotlarda `packedAt` yo'q — o'sha paytni
 * bildiruvchi `qcAt` ishlatiladi (backfill bilan bir xil qoida).
 */
export function itemActivityRefs(itemId: string, item: Record<string, unknown>) {
  const refs: { type: DailyActivityType; ref: FirebaseFirestore.DocumentReference }[] = [];
  const add = (type: DailyActivityType, at: unknown) => {
    if (!(at instanceof Timestamp)) return;
    const dateKey = businessDateString(at.toDate());
    refs.push({ type, ref: dailyActivityEvents(dateKey).doc(`${type}__${itemId}__${dateKey}`) });
  };
  add("washed", item.washedAt);
  add("packed", item.packedAt ?? item.qcAt);
  add("delivered", item.deliveredAt);
  return refs;
}

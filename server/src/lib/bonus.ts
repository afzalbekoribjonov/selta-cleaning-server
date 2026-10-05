import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./admin";

/**
 * Bonus (keshbek) — mijozga yakunlangan har bir buyurtmadan beriladigan
 * ulush. Mijoz uni keyingi buyurtmalarida chegirma sifatida ishlatadi.
 *
 * QOIDALAR (egasi bilan kelishilgan):
 *  - Asos — buyurtma uchun HAQIQATDA olingan pul: topshirishdagi naqd +
 *    karta, oldindan to'lov va yopilgan qarzlar. Chegirma, ishlatilgan
 *    bonus va yopilmagan qarz kirmaydi; ortiqcha to'lov ham (u mijozga
 *    qaytariladi).
 *  - Faqat buyurtma YAKUNLANGANDA beriladi. Qarz keyinroq yopilsa, o'sha
 *    payt yopilgan summadan beriladi.
 *  - Faqat shu tizim ishga tushgandan keyin yakunlangan buyurtmalar —
 *    belgisi `orders.bonusEarned` (yakunlanganda yoziladi, 0 bo'lsa ham).
 *  - Foiz admin panelda sozlanadi (`settings/bonus.percent`), standart 1%.
 *
 * Mijoz kaliti — telefonning oxirgi 9 raqami (`customers/{kalit}`):
 * raqam "+998...", "998..." yoki 9 raqam bo'lib yozilgan bo'lsa ham bitta
 * hisob. Hisob va tarix (`bonusLedger`) faqat server orqali o'zgaradi.
 */
export const DEFAULT_BONUS_PERCENT = 1;
export const MAX_BONUS_PERCENT = 20;

export function customerKey(phone: unknown): string | null {
  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export function customerRef(key: string) {
  return db.collection("customers").doc(key);
}

export function validateBonusPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded >= 0 && rounded <= MAX_BONUS_PERCENT ? rounded : null;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; percent: number } | null = null;

export function invalidateBonusCache(): void {
  cache = null;
}

/** Joriy foiz; o'qib bo'lmasa — oxirgi ma'lum yoki standart qiymat. */
export async function loadBonusPercent(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.percent;
  try {
    const snap = await db.collection("settings").doc("bonus").get();
    const percent = validateBonusPercent(snap.data()?.percent) ?? DEFAULT_BONUS_PERCENT;
    cache = { at: Date.now(), percent };
    return percent;
  } catch {
    return cache?.percent ?? DEFAULT_BONUS_PERCENT;
  }
}

/**
 * Bonus asosi: olingan pul, lekin buyurtmaning bonusdan tashqari
 * narxidan oshmaydi (ortiqcha to'lov qaytariladi, unga bonus yo'q).
 */
export function bonusBase(received: number, totalPrice: number, bonusUsed: number): number {
  return Math.max(0, Math.min(received, totalPrice - bonusUsed));
}

/** So'mgacha pastga yaxlitlanadi — hisobga kasr tushmaydi. */
export function bonusFor(base: number, percent: number): number {
  return base > 0 && percent > 0 ? Math.floor((base * percent) / 100) : 0;
}

interface LedgerEntry {
  type: "earn" | "spend" | "refund";
  amount: number;
  orderId: string;
  orderNumber: number;
  employeeId: string | null;
  note?: string | null;
}

/**
 * Mijoz hisobini o'zgartiradi (tranzaksiya ichida, YOZISH bosqichida).
 * `delta` musbat — hisobga tushdi, manfiy — ishlatildi.
 */
export function writeBonus(
  tx: Transaction,
  key: string,
  delta: number,
  entry: LedgerEntry,
  customer: { phone: string; name: string },
  at: Date,
): void {
  const ref = customerRef(key);
  tx.set(
    ref,
    {
      phone: customer.phone,
      name: customer.name,
      balance: FieldValue.increment(delta),
      ...(entry.type === "earn" ? { earnedTotal: FieldValue.increment(entry.amount) } : {}),
      ...(entry.type === "spend" ? { spentTotal: FieldValue.increment(entry.amount) } : {}),
      ...(entry.type === "refund" ? { spentTotal: FieldValue.increment(-entry.amount) } : {}),
      updatedAt: Timestamp.fromDate(at),
    },
    { merge: true },
  );
  tx.set(ref.collection("bonusLedger").doc(), { ...entry, note: entry.note ?? null, at: Timestamp.fromDate(at) });
}

/**
 * Buyurtma yakunlanayotganda beriladigan bonusni TAYYORLAYDI — kerakli
 * o'qishlarni qiladi (Firestore tranzaksiyasida hamma o'qish yozishdan
 * oldin bo'lishi shart) va yozish uchun funksiya qaytaradi.
 *
 * [extraReceived] — shu tranzaksiyada yozilayotgan, hali o'qilmaydigan
 * to'lov (masalan oxirgi topshirishda olingan pul).
 *
 * `null` — bonus berilmaydi (telefon yo'q yoki allaqachon berilgan).
 * Aks holda qaytgan funksiya hisobni yozadi va buyurtmaga qo'yiladigan
 * `bonusEarned` qiymatini qaytaradi.
 */
export async function prepareCompletionBonus(
  tx: Transaction,
  orderId: string,
  order: Record<string, unknown>,
  extraReceived: number,
  employeeId: string | null,
): Promise<((at: Date) => number) | null> {
  if (typeof order.bonusEarned === "number") return null;
  const key = customerKey(order.phone);
  if (!key) return null;

  const percent = await loadBonusPercent();
  const paymentsSnap = await tx.get(db.collection("payments").where("orderId", "==", orderId));
  const fromPayments = paymentsSnap.docs.reduce((sum, d) => {
    const p = d.data();
    return sum + ((p.paidAmount as number | undefined) ?? 0) + ((p.settledAmount as number | undefined) ?? 0);
  }, 0);
  const received = fromPayments + ((order.prepaidAmount as number | undefined) ?? 0) + extraReceived;
  const base = bonusBase(
    received,
    (order.totalPrice as number | undefined) ?? 0,
    (order.bonusAmount as number | undefined) ?? 0,
  );
  const earned = bonusFor(base, percent);

  return (at: Date) => {
    if (earned > 0) {
      writeBonus(
        tx,
        key,
        earned,
        { type: "earn", amount: earned, orderId, orderNumber: (order.orderNumber as number) ?? 0, employeeId, note: `${percent}%` },
        { phone: (order.phone as string) ?? "", name: (order.customerName as string) ?? "" },
        at,
      );
    }
    return earned;
  };
}

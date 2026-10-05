import type { Timestamp } from "firebase-admin/firestore";

/**
 * Oldindan (qisman) to'lov — mijoz buyurtma topshirilishidan OLDIN
 * bergan pul (masalan buyurtma ochilayotganda yoki olib ketilayotganda).
 *
 * Buyurtma hujjatining o'zida saqlanadi (`prepayments` ro'yxati va ikki
 * yig'indi), alohida jamlanmada emas: buyurtma kartasi uni qo'shimcha
 * o'qishsiz va qo'shimcha Firestore qoidasiz ko'rsatadi, yozuvlar soni
 * esa bitta buyurtmada bir nechtadan oshmaydi.
 *
 *  - `prepaidAmount` — olingan oldindan to'lovlar yig'indisi;
 *  - `prepaidUsed`   — shundan topshirishlarda hisobga olingani.
 *
 * Topshirishda mahsulotlar narxidan avval ishlatilmagan qoldiq
 * ayiriladi — dastavchik mijozdan faqat qolganini oladi. Pul olingan
 * kuni kassaga tushadi (kunlik jurnalda "prepaid" hodisasi), shuning
 * uchun topshirish kuni u ikkinchi marta sanalmaydi.
 */
export interface PrepaymentEntry {
  id: string;
  amount: number;
  cashAmount: number;
  cardAmount: number;
  at: Timestamp;
  employeeId: string;
  employeeName: string | null;
  note: string | null;
}

export const MAX_PREPAYMENT = 100_000_000;

/** Buyurtmadagi hali ishlatilmagan oldindan to'lov. */
export function prepaidCredit(order: Record<string, unknown>): number {
  const paid = typeof order.prepaidAmount === "number" ? order.prepaidAmount : 0;
  const used = typeof order.prepaidUsed === "number" ? order.prepaidUsed : 0;
  return Math.max(0, Math.round(paid - used));
}

/** Bitta topshirishda qancha oldindan to'lov hisobga olinadi. */
export function prepaidToApply(credit: number, due: number): number {
  return Math.max(0, Math.min(Math.round(credit), Math.round(due)));
}

export function prepaymentsOf(order: Record<string, unknown>): PrepaymentEntry[] {
  return Array.isArray(order.prepayments) ? (order.prepayments as PrepaymentEntry[]) : [];
}

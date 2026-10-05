import { FieldValue } from "firebase-admin/firestore";
import type { PaymentKind } from "./payments";

/**
 * Buyurtmaning to'lov yig'indilari — buyurtma hujjatining o'zida:
 *
 *  - `paidTotal`     — topshirishda/yakunlashda olingan va keyin yopilgan
 *                      qarzlardagi pul (oldindan to'lovsiz — u
 *                      `prepaidAmount`da alohida);
 *  - `discountTotal` — chegirma qilingan summa;
 *  - `debtTotal`     — hali yopilmagan qarz va qisman to'lov qoldig'i.
 *
 * NEGA: to'lov yozuvlari (`payments`) ilovaga yopiq (firestore.rules), chek
 * va kartalar esa "To'landi / Chegirma / Qarzdorlik"ni internetsiz ham
 * aniq ko'rsatishi kerak. Yig'indilar to'lov yozilgan tranzaksiyaning
 * O'ZIDA o'zgaradi, shuning uchun to'lov yozuvlari bilan hech qachon
 * farq qilmaydi.
 *
 * Tenglik: narx = to'langan + oldindan to'lov + bonus + chegirma + qarz
 * (ortiqcha to'lov bo'lsa chap tomon kichik).
 */
export interface PaymentSummary {
  paidTotal: number;
  discountTotal: number;
  debtTotal: number;
}

/** Topshirish/yakunlash — Firestore increment'lari. */
export function paymentSummaryIncrements(paid: number, kind: PaymentKind, shortfall: number): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (paid > 0) update.paidTotal = FieldValue.increment(Math.round(paid));
  if (shortfall > 0 && kind === "discount") update.discountTotal = FieldValue.increment(shortfall);
  if (shortfall > 0 && (kind === "debt" || kind === "partial")) update.debtTotal = FieldValue.increment(shortfall);
  return update;
}

/**
 * Qarz/qisman to'lov yopilganda: pul to'langanga qo'shiladi, qarz
 * yopiladi. Kamroq summa bilan yopilgan bo'lsa (kelishilgan), qolgani
 * chegirma — hisob baribir jamiga teng bo'lib qoladi.
 */
export function settlementIncrements(settledAmount: number, shortfall: number): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (settledAmount > 0) update.paidTotal = FieldValue.increment(Math.round(settledAmount));
  if (shortfall > 0) update.debtTotal = FieldValue.increment(-shortfall);
  const forgiven = shortfall - settledAmount;
  if (forgiven > 0) update.discountTotal = FieldValue.increment(Math.round(forgiven));
  return update;
}

/** To'lov yozuvlaridan buyurtmalar bo'yicha yig'indi — bir martalik to'ldirish uchun. */
export function summarizePayments(payments: Record<string, unknown>[]): Map<string, PaymentSummary> {
  const byOrder = new Map<string, PaymentSummary>();
  for (const p of payments) {
    const orderId = typeof p.orderId === "string" ? p.orderId : "";
    if (!orderId) continue;
    const entry = byOrder.get(orderId) ?? { paidTotal: 0, discountTotal: 0, debtTotal: 0 };
    const paid = (p.paidAmount as number | undefined) ?? 0;
    const shortfall = (p.shortfall as number | undefined) ?? 0;
    const settled = p.settled === true;
    const settledAmount = (p.settledAmount as number | undefined) ?? 0;
    entry.paidTotal += paid;
    if (p.kind === "discount") {
      entry.discountTotal += shortfall;
    } else if (p.kind === "debt" || p.kind === "partial") {
      if (settled) {
        entry.paidTotal += settledAmount;
        entry.discountTotal += Math.max(0, shortfall - settledAmount);
      } else {
        entry.debtTotal += shortfall;
      }
    }
    byOrder.set(orderId, entry);
  }
  for (const entry of byOrder.values()) {
    entry.paidTotal = Math.round(entry.paidTotal);
    entry.discountTotal = Math.round(entry.discountTotal);
    entry.debtTotal = Math.round(entry.debtTotal);
  }
  return byOrder;
}

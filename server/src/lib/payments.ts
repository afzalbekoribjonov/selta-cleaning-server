/**
 * Yetkazishdagi to'lov hisobi.
 *
 * Dastavchik mijozdan olgan summani MAJBURIY kiritadi. Agar u yetkazilgan
 * mahsulotlar narxidan kam bo'lsa, farq uchta yo'ldan biri bilan yopiladi:
 *
 *  - `partial`  — mijoz mahsulotlarning bir qismini oldi, qolganini
 *                 keyin olib ketganda to'laydi;
 *  - `debt`     — mijoz hammasini oldi, pul qarzga qoldi;
 *  - `discount` — farq chegirma sifatida hisobdan chiqariladi.
 *
 * `full` — kamomad umuman yo'q.
 *
 * Buyurtma summasi (`totalPrice`) chegirmada ham O'ZGARMAYDI: chegirma
 * alohida yozib boriladi, shunda hisobotlarda "jami" va "chegirma"
 * ajratilgan holda ko'rinadi va kim qancha chegirma berganini kuzatish
 * mumkin.
 */
export type PaymentKind = "full" | "partial" | "debt" | "discount";

export const PAYMENT_KINDS: PaymentKind[] = ["full", "partial", "debt", "discount"];

/** Yopilishi kerak bo'lgan turlar — qolgan pul hali olinmagan. */
export const OUTSTANDING_KINDS: PaymentKind[] = ["partial", "debt"];

export function isPaymentKind(value: unknown): value is PaymentKind {
  return typeof value === "string" && (PAYMENT_KINDS as string[]).includes(value);
}

/**
 * Olingan summani mahsulotlar orasida ULARNING NARXIGA MUTANOSIB
 * taqsimlaydi; yaxlitlash qoldig'i oxirgi mahsulotga qo'shiladi, shuning
 * uchun ulushlar yig'indisi HAR DOIM aynan `paidAmount` ga teng.
 *
 * Nega kerak: mahsulotdagi `collectedAmount` maydoni kunlik hisobotda
 * "dastavchik qo'lidagi pul" sifatida yig'iladi. Ulush yozilmasa, kam
 * to'langan buyurtma ham to'liq narxda sanalib, kassa hisobi noto'g'ri
 * chiqardi.
 */
export function splitPaidAmount(prices: number[], paidAmount: number): number[] {
  const total = prices.reduce((sum, p) => sum + p, 0);
  if (prices.length === 0) return [];
  if (total <= 0 || paidAmount <= 0) {
    // Narxsiz (yoki to'lovsiz) holatda taqsimlash ma'nosiz — hammasi
    // birinchisiga yoziladi, yig'indi baribir to'g'ri qoladi.
    return prices.map((_, i) => (i === 0 ? Math.round(paidAmount) : 0));
  }

  const shares = prices.map((p) => Math.floor((p / total) * paidAmount));
  const assigned = shares.reduce((sum, s) => sum + s, 0);
  shares[shares.length - 1] += Math.round(paidAmount) - assigned;
  return shares;
}

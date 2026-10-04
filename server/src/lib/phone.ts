/**
 * Telefon raqamining bazada uchrashi mumkin bo'lgan barcha yozilishlari.
 *
 * Buyurtmalarda raqam turli shaklda saqlangan bo'lishi mumkin ("+998...",
 * "998...", faqat 9 raqam) — qidiruv hammasini birdaniga tekshiradi.
 * Ilovadagi `phoneVariants` (orders_repository.dart) bilan bir xil.
 */
export function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
  return [...new Set([digits, last9, `+998${last9}`, `998${last9}`])];
}

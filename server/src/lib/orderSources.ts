/**
 * Buyurtma "Manba"si (talab: marketing statistikasi) — sotuv menejeri
 * buyurtma yaratishda ixtiyoriy ravishda tanlaydi, mijoz qaysi kanal
 * orqali murojaat qilganini bildiradi. mobile/lib/core/constants.dart va
 * admin_web/src/lib/order-sources.ts bilan bir xil kalitlar.
 */
export const ORDER_SOURCES = ["instagram", "telegram", "referral", "car_branding", "ad_banner"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export function isValidOrderSource(value: unknown): value is OrderSource {
  return typeof value === "string" && (ORDER_SOURCES as readonly string[]).includes(value);
}

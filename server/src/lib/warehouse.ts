import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { businessDateString } from "./businessTime";

/**
 * Omborxona qoidasi serverda — ilovadagi `delivery_buckets.dart`
 * (`isItemInWarehouse`) va admin paneldagi `lib/warehouse.ts` bilan AYNAN
 * bir xil: mahsulot "Tayyor" holatida va tayyor bo'lganiga (`packedAt`,
 * bo'lmasa `washedAt`) chegara kun yoki undan ko'p o'tgan bo'lsa — omborda.
 *
 * Omborga tushgan mahsulot faol ro'yxatlar va "yetkazishga tayyor"
 * ko'rsatkichlarida hisobga olinmaydi — u faqat Omborxonada turadi.
 */
export const DEFAULT_WAREHOUSE_READY_DAYS = 5;

const TTL_MS = 60_000;
let cache: { at: number; days: number } | null = null;

export async function loadWarehouseReadyDays(): Promise<number> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.days;
  try {
    const value = (await db.collection("settings").doc("warehouse").get()).data()?.readyDays;
    const days = typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365 ? value : DEFAULT_WAREHOUSE_READY_DAYS;
    cache = { at: Date.now(), days };
    return days;
  } catch {
    return cache?.days ?? DEFAULT_WAREHOUSE_READY_DAYS;
  }
}

export function invalidateWarehouseDays(): void {
  cache = null;
}

/** Biznes kalendari bo'yicha necha kun o'tgan (Toshkent vaqti). */
function calendarDaysSince(at: Date, now: Date): number {
  const a = Date.parse(`${businessDateString(at)}T00:00:00Z`);
  const b = Date.parse(`${businessDateString(now)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null);

export function isItemInWarehouse(item: Record<string, unknown>, readyDays: number, now: Date): boolean {
  if (item.status !== "ready") return false;
  const since = toDate(item.packedAt) ?? toDate(item.washedAt);
  return since !== null && calendarDaysSince(since, now) >= readyDays;
}

/** Buyurtmadagi (nusxa bo'yicha) omborga tushgan mahsulotlar soni. */
export function warehouseItemCount(order: Record<string, unknown>, readyDays: number, now: Date): number {
  if (order.serviceType !== "pickup" || !Array.isArray(order.itemsMirror)) return 0;
  return (order.itemsMirror as Record<string, unknown>[]).filter((m) => m && isItemInWarehouse(m, readyDays, now)).length;
}

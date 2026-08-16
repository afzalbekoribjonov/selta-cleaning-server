/**
 * Buyurtma status pipeline'lari va tarif kunlari — mobile/lib/core/constants.dart
 * va admin_web/src/lib/status-config.ts bilan bir xil manba. Uchala tomonda
 * ham shu qiymatlar mos bo'lishi kerak (rejadagi "Status pipeline" bo'limi).
 */
export type ServiceType = "pickup" | "onsite";
export type Department = "dispatcher" | "worker" | "delivery" | "qc";

export const SERVICE_PIPELINE: Record<ServiceType, string[]> = {
  pickup: ["new", "picked_up", "brought_in", "washing", "packing", "qc_review", "ready", "done"],
  onsite: ["new", "team_assigned", "in_progress", "done"],
};

export const TARIFF_DAYS: Record<string, number> = {
  express: 4,
  comfort: 7,
  standart: 12,
  premium: 4,
};

/** Berilgan xizmat turi bo'yicha `from` holatdan `to` holatga o'tish ruxsat etilganmi. */
export function isValidTransition(serviceType: ServiceType, from: string, to: string): boolean {
  const pipeline = SERVICE_PIPELINE[serviceType];
  const fromIdx = pipeline.indexOf(from);
  const toIdx = pipeline.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

export function computeDueDate(createdAt: Date, tariff: string): Date {
  const days = TARIFF_DAYS[tariff] ?? TARIFF_DAYS.standart;
  const due = new Date(createdAt);
  due.setDate(due.getDate() + days);
  return due;
}

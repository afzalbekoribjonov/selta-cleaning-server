/**
 * Buyurtma status pipeline'lari va tarif kunlari — mobile/lib/core/constants.dart
 * va admin_web/src/lib/status-config.ts bilan bir xil manba. Uchala tomonda
 * ham shu qiymatlar mos bo'lishi kerak (rejadagi "Status pipeline" bo'limi).
 *
 * Olib kelish (pickup) buyurtmalarida tarif/muddat/status ITEM darajasiga
 * ko'chirildi (har bir mahsulot o'z tarifi va o'z jarayoniga ega bo'ladi) —
 * buyurtmaning o'zi faqat item'lar mavjud bo'lishidan OLDINGI bosqichni
 * (new -> brought_in, dastavchik tomonidan bitta bosqichda, GPS bilan)
 * kuzatadi — "picked_up" oraliq bosqichi qo'shimcha ish talab qilgani
 * uchun olib tashlangan (pastdagi isValidTransition'dagi istisnoga
 * qarang; qiymat faqat eski buyurtmalar uchun massivda qolgan).
 * "brought_in" bosqichida
 * item'lar mustaqil ravishda ITEM_PIPELINE bo'ylab ishlov olinadi (bir
 * vaqtning o'zida turli bosqichlarda bo'lishi mumkin), va BARCHA itemlar
 * "done" bo'lganda buyurtmaning o'zi avtomatik "done"ga o'tadi
 * (changeItemStatus ichida). Joyida yuvish (onsite) buyurtmalar
 * o'zgarishsiz — ular bitta tashrifda tugaydi, item-darajasidagi
 * tarif/muddat ularga tegishli emas.
 */
export type ServiceType = "pickup" | "onsite";
export type Department = "dispatcher" | "worker" | "delivery";

export const SERVICE_PIPELINE: Record<ServiceType, string[]> = {
  pickup: ["new", "picked_up", "brought_in", "done"],
  onsite: ["new", "team_assigned", "in_progress", "done"],
};

/**
 * Olib kelish buyurtmasidagi HAR BIR item o'z pipeline'iga ega (talab:
 * item-darajasidagi holat/rang/qisman yetkazish). "returned" chiziqli
 * pipeline'ning bir qismi emas — u faqat "packing" bosqichida rad
 * etilganda kirilgan va "Yuvishni boshlash" tugmasi bilan "washing"ga
 * qaytiladigan alohida holat (`isValidItemTransition` shuni alohida
 * tekshiradi).
 */
export const ITEM_PIPELINE = ["pending", "washing", "packing", "ready", "done"];

export const TARIFF_DAYS: Record<string, number> = {
  express: 4,
  comfort: 7,
  standart: 12,
  premium: 4,
};

/** Berilgan xizmat turi bo'yicha `from` holatdan `to` holatga o'tish ruxsat etilganmi. */
export function isValidTransition(serviceType: ServiceType, from: string, to: string): boolean {
  // Talab: dastavchik mijozdan buyurtmani olgach, alohida "Qabul
  // qilindi" bosqichisiz to'g'ridan-to'g'ri ishchilar navbatiga
  // ("brought_in") tushadi. Eski "picked_up" holati statusHistory va
  // eski buyurtmalar uchun qiymat sifatida saqlanib qoladi (shuning
  // uchun pipeline massividan olib tashlanmaydi, faqat shu istisno
  // qo'shiladi) — "picked_up -> brought_in" ham pastdagi umumiy
  // qo'shnichilik tekshiruvi orqali hamon ishlayveradi.
  if (serviceType === "pickup" && from === "new" && to === "brought_in") return true;
  const pipeline = SERVICE_PIPELINE[serviceType];
  const fromIdx = pipeline.indexOf(from);
  const toIdx = pipeline.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

/**
 * Item-darajasidagi o'tish qoidalari (faqat pickup buyurtmalar) — chiziqli
 * pipeline bo'ylab bittalab oldinga, PLUS "packing"dan "returned"ga
 * (sifat nazoratida rad etilganda) va "returned"dan "washing"ga
 * ("Yuvishni boshlash" tugmasi bilan qayta ishlov boshlanganda).
 */
export function isValidItemTransition(from: string, to: string): boolean {
  if (from === "packing" && to === "returned") return true;
  if (from === "returned" && to === "washing") return true;
  const fromIdx = ITEM_PIPELINE.indexOf(from);
  const toIdx = ITEM_PIPELINE.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

export function computeDueDate(createdAt: Date, tariff: string): Date {
  const days = TARIFF_DAYS[tariff] ?? TARIFF_DAYS.standart;
  const due = new Date(createdAt);
  due.setDate(due.getDate() + days);
  return due;
}

/**
 * Rang bosqichi (yashil/sariq/qizil) — item qo'shilgan kundan boshlab
 * o'tgan kun soniga qarab, shu itemning o'ziga xos tarifi bo'yicha.
 * Talab: har bir tarif uchun aniq kun bo'linishi (yashil/sariq/qizil).
 * `elapsedDays` — item qo'shilgan kundan boshlab to'liq o'tgan kunlar
 * soni (0 = bugun qo'shilgan).
 */
export const TARIFF_COLOR_THRESHOLDS: Record<string, { green: number; yellow: number }> = {
  // Express: 4 kun (2 yashil / 1 sariq / 1 qizil)
  express: { green: 2, yellow: 3 },
  // Comfort: 7 kun (3 yashil / 2 sariq / 2 qizil)
  comfort: { green: 3, yellow: 5 },
  // Premium: 4 kun (Express bilan bir xil)
  premium: { green: 2, yellow: 3 },
  // Standart: 12 kun (4 yashil / 4 sariq / 4 qizil)
  standart: { green: 4, yellow: 8 },
};

export type ColorStage = "green" | "yellow" | "red";

export function colorStageFor(tariff: string, elapsedDays: number): ColorStage {
  const t = TARIFF_COLOR_THRESHOLDS[tariff] ?? TARIFF_COLOR_THRESHOLDS.standart;
  if (elapsedDays < t.green) return "green";
  if (elapsedDays < t.yellow) return "yellow";
  return "red";
}

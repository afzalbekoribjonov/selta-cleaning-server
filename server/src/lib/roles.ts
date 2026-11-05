/**
 * Nazoratchi (supervisor) — ish jarayonini to'liq boshqaradigan xodim.
 *
 * U "Boshqa" bo'limi orqali kiradi (doimiy uch bo'limga kirmaydi), lekin
 * odatiy "Boshqa" kasblardan farqli o'laroq maxsus vakolatlarga ega:
 * boshqa xodim NOMIDAN ish holatini qayd etadi (kim yuvdi/kim upakovka
 * qildi), dastavchiklarga buyurtma biriktiradi, ogohlantirish beradi va
 * xodimlarning kunlik ishini ko'radi.
 */
export const SUPERVISOR = "supervisor";

/** Qurilgan (customDepartments'da yo'q) bo'limlar nomi. */
export const BUILTIN_DEPARTMENT_LABELS: Record<string, string> = {
  [SUPERVISOR]: "Nazoratchi",
};

/** Ish jarayonini boshqarish huquqi — admin yoki nazoratchi. */
export function canManageWorkflow(role: string | undefined): boolean {
  return role === "admin" || role === SUPERVISOR;
}

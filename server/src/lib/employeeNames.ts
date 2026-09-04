import { db } from "./admin";

/**
 * employeeId -> to'liq ism.
 *
 * Qisqa muddatli keshda: hisobotlar har ochilganda butun `employees`
 * jamlanmasini qayta o'qishning ma'nosi yo'q — ismlar deyarli
 * o'zgarmaydi. Eng yomon holatda yangi qo'shilgan xodim ismi bir necha
 * daqiqa "Noma'lum" ko'rinadi, keyin o'z-o'zidan to'g'rilanadi.
 */
const TTL_MS = 5 * 60_000;
let cache: { at: number; names: Map<string, string> } | null = null;

export async function loadEmployeeNames(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  const snap = await db.collection("employees").get();
  const names = new Map(snap.docs.map((d) => [d.id, (d.data().fullName as string) ?? "Noma'lum"]));
  cache = { at: Date.now(), names };
  return names;
}

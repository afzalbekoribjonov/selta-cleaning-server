import { db } from "./admin";

/**
 * Xodimlar ma'lumotnomasi: ism, bo'lim va holat.
 *
 * Qisqa muddatli keshda: hisobotlar har ochilganda butun `employees`
 * jamlanmasini qayta o'qishning ma'nosi yo'q — ismlar deyarli
 * o'zgarmaydi. Eng yomon holatda yangi qo'shilgan xodim ismi bir necha
 * daqiqa "Noma'lum" ko'rinadi, keyin o'z-o'zidan to'g'rilanadi.
 */
export interface EmployeeInfo {
  name: string;
  department: string;
  /** "active" | "terminated" | ... */
  status: string;
}

const TTL_MS = 5 * 60_000;
let cache: { at: number; directory: Map<string, EmployeeInfo>; names: Map<string, string> } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const snap = await db.collection("employees").get();
  const directory = new Map<string, EmployeeInfo>();
  for (const d of snap.docs) {
    const data = d.data();
    directory.set(d.id, {
      name: (data.fullName as string) ?? "Noma'lum",
      department: (data.department as string) ?? "",
      status: (data.status as string) ?? "active",
    });
  }
  const names = new Map([...directory].map(([id, info]) => [id, info.name]));
  cache = { at: Date.now(), directory, names };
  return cache;
}

/** employeeId -> to'liq ism. */
export async function loadEmployeeNames(): Promise<Map<string, string>> {
  return (await load()).names;
}

/** employeeId -> ism, bo'lim, holat. */
export async function loadEmployeeDirectory(): Promise<Map<string, EmployeeInfo>> {
  return (await load()).directory;
}

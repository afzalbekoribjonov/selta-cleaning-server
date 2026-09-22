import { db } from "./admin";
import { DEFAULT_TARIFFS, mergeWithDefaults, type TariffConfig } from "./tariffConfig";

/**
 * Tarif sozlamalarining saqlanishi va keshlanishi.
 *
 * Avval muddat va rang bosqichlari uch joyda (server, admin panel,
 * ilova) QATTIQ yozilgan edi va o'zgartirish uchun uchala loyihani qayta
 * yig'ish kerak bo'lardi. Endi ular `settings/tariffs` hujjatida turadi
 * va admin panel orqali tahrirlanadi.
 *
 * Toza mantiq (tekshirish, standart qiymatlar) — lib/tariffConfig.ts da.
 */
export * from "./tariffConfig";

const settingsDoc = () => db.collection("settings").doc("tariffs");

// Buyurtma yaratishda har safar Firestore'dan o'qish qimmat: sozlama juda
// kam o'zgaradi, shuning uchun jarayon ichida qisqa muddatga keshlanadi.
// Admin o'zgartirganda kesh darhol bekor qilinadi; boshqa nusxalar esa
// TTL tugagach yangilanadi.
const CACHE_TTL_MS = 60_000;
let cache: { at: number; value: TariffConfig } | null = null;

export function invalidateTariffCache(): void {
  cache = null;
}

/**
 * Joriy sozlama.
 *
 * Firestore o'qishi muvaffaqiyatsiz bo'lsa eski kesh, u ham bo'lmasa
 * standart qiymatlar qaytadi: muddat hisoblash sozlama o'qib
 * bo'lmagani uchun to'xtab qolmasligi kerak — buyurtma yaratish undan
 * muhimroq.
 */
export async function loadTariffs(): Promise<TariffConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const snap = await settingsDoc().get();
    const value = mergeWithDefaults(snap.data());
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return cache?.value ?? DEFAULT_TARIFFS;
  }
}

export async function saveTariffs(config: TariffConfig, updatedBy: string): Promise<void> {
  await settingsDoc().set({ ...config, updatedBy, updatedAt: new Date() }, { merge: true });
  invalidateTariffCache();
}

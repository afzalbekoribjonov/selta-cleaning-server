/**
 * Tarif sozlamasining TOZA qismi — muddat, rang bosqichlari va ularni
 * tekshirish. Bu yerda Firestore yo'q, shuning uchun mantiq kredentialsiz
 * ham ishga tushadi va sinovdan o'tkaziladi (lib/payments.ts bilan bir xil
 * yondashuv). Saqlash va keshlash — lib/tariffs.ts da.
 */

export interface TariffSetting {
  /** Buyurtma muddati — mahsulot qo'shilgan kundan boshlab. */
  days: number;
  /** Shu kungacha rang YASHIL (`elapsedDays < green`). */
  green: number;
  /** Shu kungacha SARIQ, undan keyin QIZIL. */
  yellow: number;
}

export type TariffConfig = Record<string, TariffSetting>;

/** Tizimdagi tariflar — ro'yxat qat'iy, faqat qiymatlari o'zgaradi. */
export const TARIFF_KEYS = ["express", "comfort", "standart", "premium"] as const;

/**
 * Sozlama hujjati bo'lmaganda ishlatiladigan qiymatlar — bu maydonlar
 * joriy etilishidan oldin uch joyda qattiq yozilgan qiymatlarning aynan
 * o'zi, ya'ni hech narsa sozlanmagan tizim avvalgidek ishlayveradi.
 */
export const DEFAULT_TARIFFS: TariffConfig = {
  // Express: 4 kun (2 yashil / 1 sariq / 1 qizil)
  express: { days: 4, green: 2, yellow: 3 },
  // Comfort: 7 kun (3 yashil / 2 sariq / 2 qizil)
  comfort: { days: 7, green: 3, yellow: 5 },
  // Standart: 12 kun (4 yashil / 4 sariq / 4 qizil)
  standart: { days: 12, green: 4, yellow: 8 },
  // Premium: Express bilan bir xil
  premium: { days: 4, green: 2, yellow: 3 },
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Bitta tarif yozuvini tekshiradi.
 *
 * Qoida: `1 <= green < yellow <= days`. Buzilgan yozuv qabul qilinmaydi —
 * aks holda rang bosqichlari mantiqsiz bo'lardi: sariq yashildan oldin
 * tugasa, sariq bosqich umuman ko'rinmasdi.
 */
export function validateTariffSetting(raw: unknown): TariffSetting | null {
  if (!raw || typeof raw !== "object") return null;
  const { days, green, yellow } = raw as Record<string, unknown>;
  if (!isCount(days) || !isCount(green) || !isCount(yellow)) return null;
  if (days < 1 || days > 365) return null;
  if (green < 1 || green >= yellow || yellow > days) return null;
  return { days, green, yellow };
}

/** Saqlangan hujjatni standart qiymatlar ustiga qo'yadi. */
export function mergeWithDefaults(data: Record<string, unknown> | undefined): TariffConfig {
  const merged: TariffConfig = {};
  for (const key of TARIFF_KEYS) {
    merged[key] = validateTariffSetting(data?.[key]) ?? DEFAULT_TARIFFS[key];
  }
  return merged;
}

/**
 * Kiruvchi so'rovni saqlashga tayyor ko'rinishga keltiradi. Biror tarif
 * noto'g'ri bo'lsa `null` — chaqiruvchi butun so'rovni rad etadi, chunki
 * yarim saqlangan sozlama muddatlarni chalkashtirib yuborardi.
 */
export function normalizeTariffs(raw: unknown): TariffConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const result: TariffConfig = {};
  for (const key of TARIFF_KEYS) {
    const setting = validateTariffSetting(source[key]);
    if (!setting) return null;
    result[key] = setting;
  }
  return result;
}

/** Tarif muddati (kun) — noma'lum tarifda standart tarifniki. */
export function tariffDays(config: TariffConfig, tariff: string | null | undefined): number {
  return (tariff && config[tariff]?.days) || config.standart.days;
}

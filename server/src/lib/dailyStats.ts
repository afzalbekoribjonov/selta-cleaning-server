import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { businessDateString, businessDayRangeUtc } from "./businessTime";
import { cashPartOf } from "./dailyActivity";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "./orderSummary";

/**
 * Bir kunning QISQA ko'rsatkichlari — boshqaruv panelidagi kunlik
 * grafiklar uchun (routes/dailyReport.ts: /adminDailyTrend).
 *
 * Hisoblash /adminDailyReport bilan AYNAN bir xil qoidada (bitta kunning
 * `dailyActivity` jurnali + shu kuni sexga kelgan buyurtmalar), faqat
 * qatorlarsiz — sonlar va birlik bo'yicha hajmlar.
 *
 * O'tgan kunlar `dailyStats/{kun}` hujjatida KESHLANADI: grafik har
 * ochilganda o'nlab kunning barcha hodisalarini qayta o'qish qimmat.
 * Bugun va kecha har safar qayta hisoblanadi (kech qolgan amal yoki
 * o'chirilgan mahsulot ularni o'zgartirishi mumkin).
 */
// 2 -> donalik ("count") mahsulot o'z sonicha sanaladi (avval doim 1).
export const DAY_STATS_VERSION = 2;

export type UnitMap = Record<string, number>;

export interface StageStats {
  /** Nechta mahsulot. */
  count: number;
  orderCount: number;
  /** Birlik bo'yicha hajm: { sqm: 45.7, dona: 3, kg: 2.5 }. */
  units: UnitMap;
}

export interface DayStats {
  date: string;
  intake: { orderCount: number; itemCount: number; units: UnitMap };
  washed: StageStats;
  packed: StageStats;
  delivered: StageStats & { amount: number; cash: number; card: number };
  /** Kassaga tushgan jami pul: yetkazish + yopilgan qarz + oldindan to'lov. */
  collected: { amount: number; cash: number; card: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function addUnit(map: UnitMap, unit: string, amount: number) {
  if (!(amount > 0)) return;
  map[unit] = round2((map[unit] ?? 0) + amount);
}

/** Bitta kunni jurnaldan hisoblaydi (keshsiz). */
export async function computeDayStats(dateKey: string): Promise<DayStats> {
  const range = businessDayRangeUtc(dateKey);
  if (!range) throw new Error(`Noto'g'ri sana: ${dateKey}`);

  const [eventsSnap, intakeSnap] = await Promise.all([
    db.collection("dailyActivity").doc(dateKey).collection("events").get(),
    db
      .collection("orders")
      .where("pickedUpAt", ">=", Timestamp.fromDate(range.start))
      .where("pickedUpAt", "<", Timestamp.fromDate(range.end))
      .get(),
  ]);

  const stage = () => ({ count: 0, orders: new Set<string>(), units: {} as UnitMap });
  const washed = stage();
  const packed = stage();
  const delivered = { ...stage(), amount: 0, cash: 0, card: 0 };
  const collected = { amount: 0, cash: 0, card: 0 };

  for (const doc of eventsSnap.docs) {
    const e = doc.data();
    const type = e.type as string;
    const calcType = (e.calcType as string | null) ?? null;
    const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
    const amount = unitAmountOf(calcType, e.qty as number | null);
    const orderId = (e.orderId as string) ?? "";
    const money = {
      collectedAmount: (e.collectedAmount as number | null) ?? null,
      cashAmount: (e.cashAmount as number | null) ?? null,
      cardAmount: (e.cardAmount as number | null) ?? null,
      price: (e.price as number | null) ?? null,
    };

    if (type === "washed" || type === "packed") {
      const target = type === "washed" ? washed : packed;
      target.count += 1;
      target.orders.add(orderId);
      addUnit(target.units, unit, amount);
    } else if (type === "delivered" || type === "onsite_done") {
      delivered.count += 1;
      delivered.orders.add(orderId);
      addUnit(delivered.units, unit, amount);
      const paid = money.collectedAmount ?? money.price ?? 0;
      delivered.amount += paid;
      delivered.cash += cashPartOf(money);
      delivered.card += money.cardAmount ?? 0;
      collected.amount += paid;
      collected.cash += cashPartOf(money);
      collected.card += money.cardAmount ?? 0;
    } else if (type === "settled" || type === "prepaid") {
      // Pul hodisasi — mahsulot bosqichi emas (adminDailyReport bilan bir xil).
      const paid = money.collectedAmount ?? 0;
      collected.amount += paid;
      collected.cash += cashPartOf({ ...money, price: 0 });
      collected.card += money.cardAmount ?? 0;
    }
  }

  const intakeUnits: UnitMap = {};
  let intakeItems = 0;
  for (const doc of intakeSnap.docs) {
    const o = doc.data();
    intakeItems += (o.itemCount as number | undefined) ?? 0;
    for (const [unit, amount] of Object.entries((o.itemUnitTotals as UnitMap | undefined) ?? {})) {
      addUnit(intakeUnits, unit, amount);
    }
  }

  const finish = (s: ReturnType<typeof stage>): StageStats => ({ count: s.count, orderCount: s.orders.size, units: s.units });
  return {
    date: dateKey,
    intake: { orderCount: intakeSnap.size, itemCount: intakeItems, units: intakeUnits },
    washed: finish(washed),
    packed: finish(packed),
    delivered: {
      ...finish(delivered),
      amount: Math.round(delivered.amount),
      cash: Math.round(delivered.cash),
      card: Math.round(delivered.card),
    },
    collected: {
      amount: Math.round(collected.amount),
      cash: Math.round(collected.cash),
      card: Math.round(collected.card),
    },
  };
}

/** "2026-11-03" + n kun (manfiy ham bo'ladi). */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Kunlar oralig'i ([endKey] dan orqaga [days] kun, eskidan yangiga).
 * Kecha va undan oldingi kunlar keshdan; bugun va kecha qayta hisoblanadi.
 */
export async function loadDayStatsRange(endKey: string, days: number, now: Date = new Date()): Promise<DayStats[]> {
  const todayKey = businessDateString(now);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const keys = Array.from({ length: days }, (_, i) => shiftDateKey(endKey, i - days + 1)).filter((k) => k <= todayKey);

  const cacheRefs = keys.map((k) => db.collection("dailyStats").doc(k));
  const cached = cacheRefs.length > 0 ? await db.getAll(...cacheRefs) : [];

  return Promise.all(
    keys.map(async (key, i) => {
      const fresh = key >= yesterdayKey;
      const hit = cached[i];
      if (!fresh && hit?.exists && hit.data()?.version === DAY_STATS_VERSION) {
        const { version: _v, computedAt: _c, ...stats } = hit.data()!;
        return stats as DayStats;
      }
      const stats = await computeDayStats(key);
      // Bugun hali o'zgaradi — keshlanmaydi.
      if (key !== todayKey) {
        await cacheRefs[i].set({ ...stats, version: DAY_STATS_VERSION, computedAt: new Date() });
      }
      return stats;
    }),
  );
}

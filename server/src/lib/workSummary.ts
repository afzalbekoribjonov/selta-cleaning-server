import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { businessDateString, businessDayRangeUtc } from "./businessTime";
import { cashPartOf, dailyActivityEvents } from "./dailyActivity";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "./orderSummary";
import { TARIFF_KEYS } from "./tariffConfig";

/**
 * Xodimlarning ISHI — kun bo'yicha, mahsulot × tarif × birlik aniqligida.
 * "Maosh va statistika" sahifasi, ishbay hisobi va oylik maosh shu yerdan.
 *
 * MANBA (admin paneldagi kunlik hisobot bilan bir xil):
 *  - yuvdi / qadoqladi / topshirdi / qayta yuvishga qaytdi / joyida yuvish —
 *    `dailyActivity/{kun}` jurnali (bir kun = bitta so'rov);
 *  - sotuv menejeri ochgan buyurtmalar — `createdAt` shu kuni (mahsulotlari
 *    buyurtmadagi nusxadan, alohida o'qishsiz);
 *  - dastavchik olib kelgani — `pickedUpAt` shu kuni.
 *
 * TEJAMKORLIK: tugagan kun natijasi `workSummaries/{kun}` hujjatida
 * saqlanadi — oy ko'rilganda ~30 ta hujjat o'qiladi, minglab hodisa emas.
 * Faqat oxirgi FRESH_DAYS kun har safar qayta hisoblanadi: buyurtma ochilgan
 * kundan keyin ham o'lchanib narxi o'zgaradi (sotuv menejeri foizi shunga
 * bog'liq), shuning uchun yangi kunlar "muzlatilmaydi". Avvalgi
 * `computeMonthlyPayroll` har safar BARCHA buyurtmalarning BARCHA
 * mahsulotlarini o'qirdi.
 */

/** 2: qayta yuvish alohida (`rewashed`), qatorlarda productId. */
export const WORK_SUMMARY_VERSION = 2;
/** Shu kundan yangi kunlar keshlanmaydi (buyurtmalar hali o'lchanayotgan bo'ladi). */
export const FRESH_DAYS = 7;

export const UNITS = ["sqm", "meter", "kg", "dona"] as const;
export type Unit = (typeof UNITS)[number];

/** Bitta qator: mahsulot nomi × tarif × birlik. */
export interface WorkLine {
  name: string;
  tariff: string;
  unit: Unit;
  /** Nechta mahsulot. */
  count: number;
  /** Shu birlikdagi hajm (m², metr, kg yoki dona). */
  amount: number;
  /** Mahsulotlar narxi (mijoz to'laydigan). */
  price: number;
  /** Katalogdagi mahsulot — ishbay narxi shu bo'yicha topiladi (eski yozuvlarda yo'q). */
  productId?: string | null;
}

export type Lines = Record<string, WorkLine>;

export interface EmployeeWork {
  washed: Lines;
  packed: Lines;
  delivered: Lines;
  /** Shu xodim YUVGAN, keyin qayta yuvishga qaytarilgan mahsulotlar. */
  returned: Lines;
  /** Qaytgan mahsulotni qayta yuvgani — haq to'lanmaydi, "Yuvildi"ga qo'shilmaydi. */
  rewashed: Lines;
  /** Topshirish pullari: mahsulotlar narxi va mijozdan olingan. */
  deliveredMoney: { value: number; collected: number; cash: number; card: number; orders: number };
  /** Joyida yuvishni o'zi yakunlagan (pulini olgan) buyurtmalar. */
  onsite: { orders: number; revenue: number; collected: number };
  /** Jamoa a'zosi sifatida qatnashgan joyida yuvish buyurtmalari. */
  onsiteTeam: { orders: number; revenue: number };
  /** Sotuv menejeri: ochgan buyurtmalari va ulardagi mahsulotlar. */
  created: { orders: number; revenue: number; orderNumbers: number[]; items: Lines };
  /** Dastavchik: mijozdan olib kelgan buyurtmalari. */
  pickedUp: { orders: number; items: number; orderNumbers: number[] };
}

export interface DayWork {
  date: string;
  employees: Record<string, EmployeeWork>;
}

// ----------------------------------------------------------------- YORDAMCHI

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeTariff(raw: unknown): string {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (t === "standard") return "standart";
  return (TARIFF_KEYS as readonly string[]).includes(t) ? t : "none";
}

export function unitOf(calcType: string | null | undefined): Unit {
  const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
  return (UNITS as readonly string[]).includes(unit) ? (unit as Unit) : "dona";
}

export function emptyWork(): EmployeeWork {
  return {
    washed: {},
    packed: {},
    delivered: {},
    returned: {},
    rewashed: {},
    deliveredMoney: { value: 0, collected: 0, cash: 0, card: 0, orders: 0 },
    onsite: { orders: 0, revenue: 0, collected: 0 },
    onsiteTeam: { orders: 0, revenue: 0 },
    created: { orders: 0, revenue: 0, orderNumbers: [], items: {} },
    pickedUp: { orders: 0, items: 0, orderNumbers: [] },
  };
}

/** Nom bo'shliq va registrdan qat'i nazar bitta qatorga tushadi. */
function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  return name || "Mahsulot";
}

export function addLine(lines: Lines, line: WorkLine): void {
  const key = `${line.name.toLowerCase()}|${line.tariff}|${line.unit}`;
  const cur = lines[key];
  if (cur) {
    cur.count += line.count;
    cur.amount = round2(cur.amount + line.amount);
    cur.price += line.price;
    if (!cur.productId && line.productId) cur.productId = line.productId;
  } else {
    lines[key] = { ...line, amount: round2(line.amount) };
  }
}

function mergeLines(into: Lines, from: Lines): void {
  for (const line of Object.values(from)) addLine(into, line);
}

/** Bir nechta kunni bitta natijaga qo'shadi. */
export function mergeWork(into: EmployeeWork, from: EmployeeWork): void {
  mergeLines(into.washed, from.washed);
  mergeLines(into.packed, from.packed);
  mergeLines(into.delivered, from.delivered);
  mergeLines(into.returned, from.returned);
  mergeLines(into.rewashed, from.rewashed ?? {});
  for (const k of ["value", "collected", "cash", "card", "orders"] as const) into.deliveredMoney[k] += from.deliveredMoney[k];
  for (const k of ["orders", "revenue", "collected"] as const) into.onsite[k] += from.onsite[k];
  into.onsiteTeam.orders += from.onsiteTeam.orders;
  into.onsiteTeam.revenue += from.onsiteTeam.revenue;
  into.created.orders += from.created.orders;
  into.created.revenue += from.created.revenue;
  into.created.orderNumbers.push(...from.created.orderNumbers);
  mergeLines(into.created.items, from.created.items);
  into.pickedUp.orders += from.pickedUp.orders;
  into.pickedUp.items += from.pickedUp.items;
  into.pickedUp.orderNumbers.push(...from.pickedUp.orderNumbers);
}

/** Birlik bo'yicha jami hajm: { sqm: 213.66, dona: 2, ... }. */
export function unitTotals(lines: Lines): Record<Unit, number> {
  const totals: Record<Unit, number> = { sqm: 0, meter: 0, kg: 0, dona: 0 };
  for (const l of Object.values(lines)) totals[l.unit] = round2(totals[l.unit] + l.amount);
  return totals;
}

export function countOf(lines: Lines): number {
  return Object.values(lines).reduce((s, l) => s + l.count, 0);
}

// -------------------------------------------------------------- KUNNI HISOBLASH

interface OrderInfo {
  tariff: string | null;
  team: string[];
  /** itemId -> tarif */
  itemTariffs: Map<string, string>;
  /** itemId -> katalogdagi mahsulot */
  itemProducts: Map<string, string>;
}

function orderInfo(o: Record<string, unknown>): OrderInfo {
  const itemTariffs = new Map<string, string>();
  const itemProducts = new Map<string, string>();
  if (Array.isArray(o.itemsMirror)) {
    for (const m of o.itemsMirror as Record<string, unknown>[]) {
      if (!m || typeof m.id !== "string") continue;
      if (typeof m.tariff === "string") itemTariffs.set(m.id, m.tariff);
      if (typeof m.productId === "string") itemProducts.set(m.id, m.productId);
    }
  }
  return {
    tariff: typeof o.tariff === "string" ? o.tariff : null,
    team: Array.isArray(o.assignedTeam) ? (o.assignedTeam as unknown[]).filter((x): x is string => typeof x === "string") : [],
    itemTariffs,
    itemProducts,
  };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Bitta kunni bazadan hisoblaydi (keshsiz). Toza qismi — `buildDayWork`.
 */
export async function computeDayWork(dateKey: string): Promise<DayWork> {
  const range = businessDayRangeUtc(dateKey);
  if (!range) throw new Error(`Noto'g'ri sana: ${dateKey}`);
  const start = Timestamp.fromDate(range.start);
  const end = Timestamp.fromDate(range.end);

  const [eventsSnap, createdSnap, pickedSnap] = await Promise.all([
    dailyActivityEvents(dateKey).get(),
    db.collection("orders").where("createdAt", ">=", start).where("createdAt", "<", end).get(),
    db.collection("orders").where("pickedUpAt", ">=", start).where("pickedUpAt", "<", end).get(),
  ]);

  const orders = new Map<string, Record<string, unknown>>();
  for (const d of [...createdSnap.docs, ...pickedSnap.docs]) orders.set(d.id, d.data());

  const events = eventsSnap.docs.map((d) => d.data());
  // Tarifi yozilmagan (eski) hodisalar va joyida yuvish jamoasi uchun —
  // buyurtmaning o'zi kerak. Yangi hodisalarda tarif bor, o'qish shart emas.
  const needed = new Set<string>();
  for (const e of events) {
    const orderId = typeof e.orderId === "string" ? e.orderId : "";
    if (!orderId || orders.has(orderId)) continue;
    if (e.type === "onsite_done" || (e.itemId && typeof e.tariff !== "string")) needed.add(orderId);
  }
  const ids = [...needed];
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map((id) => db.collection("orders").doc(id)));
    for (const s of snaps) if (s.exists) orders.set(s.id, s.data() ?? {});
  }

  return buildDayWork(dateKey, events, orders);
}

/** Toza hisob: jurnal hodisalari + buyurtmalar -> xodimlar ishi. */
export function buildDayWork(
  dateKey: string,
  events: Record<string, unknown>[],
  orders: Map<string, Record<string, unknown>>,
): DayWork {
  const employees: Record<string, EmployeeWork> = {};
  const work = (id: string) => (employees[id] ??= emptyWork());
  const infos = new Map<string, OrderInfo>();
  const info = (id: string) => {
    let i = infos.get(id);
    if (!i) {
      i = orderInfo(orders.get(id) ?? {});
      infos.set(id, i);
    }
    return i;
  };

  for (const e of events) {
    const type = typeof e.type === "string" ? e.type : "";
    const employeeId = typeof e.employeeId === "string" ? e.employeeId : "";
    const orderId = typeof e.orderId === "string" ? e.orderId : "";
    const itemId = typeof e.itemId === "string" ? e.itemId : null;
    const calcType = typeof e.calcType === "string" ? e.calcType : null;
    const price = num(e.price) ?? 0;
    const tariff = normalizeTariff(
      typeof e.tariff === "string" ? e.tariff : (itemId && info(orderId).itemTariffs.get(itemId)) ?? info(orderId).tariff,
    );
    // Katalogdagi mahsulot: yangi hodisada bor, eskisida — buyurtma nusxasidan (bo'lsa).
    const productId = typeof e.productId === "string" && e.productId ? e.productId : itemId ? info(orderId).itemProducts.get(itemId) : undefined;
    const line = (): WorkLine => ({
      name: cleanName(e.itemName),
      tariff,
      unit: unitOf(calcType),
      count: 1,
      amount: unitAmountOf(calcType, num(e.qty)),
      price,
      ...(productId ? { productId } : {}),
    });

    if (!employeeId) continue;
    switch (type) {
      case "washed":
        if (itemId) addLine(work(employeeId).washed, line());
        break;
      case "packed":
        if (itemId) addLine(work(employeeId).packed, line());
        break;
      case "returned":
        if (itemId) addLine(work(employeeId).returned, line());
        break;
      case "rewashed":
        if (itemId) addLine(work(employeeId).rewashed, line());
        break;
      case "delivered": {
        const w = work(employeeId);
        if (itemId) addLine(w.delivered, line());
        w.deliveredMoney.value += price;
        w.deliveredMoney.collected += num(e.collectedAmount) ?? 0;
        w.deliveredMoney.cash += cashPartOf(e as { cashAmount?: number | null; collectedAmount?: number | null; price?: number | null });
        w.deliveredMoney.card += num(e.cardAmount) ?? 0;
        break;
      }
      case "onsite_done": {
        const w = work(employeeId);
        w.onsite.orders += 1;
        w.onsite.revenue += price;
        w.onsite.collected += num(e.collectedAmount) ?? 0;
        for (const member of info(orderId).team) {
          const t = work(member);
          t.onsiteTeam.orders += 1;
          t.onsiteTeam.revenue += price;
        }
        break;
      }
      default:
        break;
    }
  }

  // Topshirilgan buyurtmalar soni (bir buyurtmaning bir nechta mahsuloti — bitta).
  const deliveredOrders = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== "delivered" || typeof e.employeeId !== "string" || !e.employeeId) continue;
    const set = deliveredOrders.get(e.employeeId) ?? new Set<string>();
    set.add(typeof e.orderId === "string" ? e.orderId : "");
    deliveredOrders.set(e.employeeId, set);
  }
  for (const [id, set] of deliveredOrders) work(id).deliveredMoney.orders = set.size;

  const range = businessDayRangeUtc(dateKey)!;
  const inDay = (v: unknown) => {
    if (!(v instanceof Timestamp)) return false;
    const t = v.toMillis();
    return t >= range.start.getTime() && t < range.end.getTime();
  };

  for (const o of orders.values()) {
    const orderNumber = num(o.orderNumber) ?? 0;
    if (inDay(o.createdAt) && typeof o.createdBy === "string" && o.createdBy) {
      const c = work(o.createdBy).created;
      c.orders += 1;
      c.revenue += num(o.totalPrice) ?? 0;
      c.orderNumbers.push(orderNumber);
      const orderTariff = typeof o.tariff === "string" ? o.tariff : null;
      for (const m of Array.isArray(o.itemsMirror) ? (o.itemsMirror as Record<string, unknown>[]) : []) {
        if (!m) continue;
        const calcType = typeof m.calcType === "string" ? m.calcType : null;
        addLine(c.items, {
          name: cleanName(m.name),
          tariff: normalizeTariff(typeof m.tariff === "string" ? m.tariff : orderTariff),
          unit: unitOf(calcType),
          count: 1,
          amount: unitAmountOf(calcType, num(m.qty)),
          price: num(m.price) ?? 0,
        });
      }
    }
    if (inDay(o.pickedUpAt) && typeof o.pickedUpBy === "string" && o.pickedUpBy && o.intakeMethod !== "walk_in") {
      const p = work(o.pickedUpBy).pickedUp;
      p.orders += 1;
      p.items += num(o.itemCount) ?? 0;
      p.orderNumbers.push(orderNumber);
    }
  }

  return { date: dateKey, employees };
}

// ------------------------------------------------------------------ KESH

const memory = new Map<string, { at: number; day: DayWork }>();
const MEMORY_TTL_MS = 2 * 60_000;
const inFlight = new Map<string, Promise<DayWork>>();

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** Kunning natijasi: eski kun — Firestore keshidan, yangisi — qayta hisoblanadi. */
export async function loadDayWork(dateKey: string, opts: { force?: boolean; now?: Date } = {}): Promise<DayWork> {
  const today = businessDateString(opts.now ?? new Date());
  const settled = daysBetween(dateKey, today) > FRESH_DAYS;
  const cacheRef = db.collection("workSummaries").doc(dateKey);

  if (!opts.force) {
    const hit = memory.get(dateKey);
    if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.day;
    const pending = inFlight.get(dateKey);
    if (pending) return pending;
  }

  const promise = (async () => {
    if (settled && !opts.force) {
      const snap = await cacheRef.get();
      const data = snap.data();
      if (snap.exists && data?.version === WORK_SUMMARY_VERSION && data.employees && typeof data.employees === "object") {
        const day: DayWork = { date: dateKey, employees: data.employees as Record<string, EmployeeWork> };
        memory.set(dateKey, { at: Date.now(), day });
        return day;
      }
    }
    const day = await computeDayWork(dateKey);
    memory.set(dateKey, { at: Date.now(), day });
    if (settled) {
      await cacheRef
        .set({ version: WORK_SUMMARY_VERSION, date: dateKey, computedAt: Timestamp.now(), employees: day.employees })
        .catch((err) => console.error("workSummaries keshini yozib bo'lmadi:", err));
    }
    if (memory.size > 120) memory.delete(memory.keys().next().value as string);
    return day;
  })().finally(() => inFlight.delete(dateKey));
  inFlight.set(dateKey, promise);
  return promise;
}

/** "2026-11-01".."2026-11-19" oralig'idagi kun kalitlari (ikkala chet ham kiradi). */
export function dateKeysBetween(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  const start = Date.parse(`${fromKey}T00:00:00Z`);
  const end = Date.parse(`${toKey}T00:00:00Z`);
  for (let t = start; t <= end; t += 86_400_000) keys.push(new Date(t).toISOString().slice(0, 10));
  return keys;
}

/** Oraliqdagi barcha kunlar ishi — xodim bo'yicha qo'shilgan. */
export async function loadPeriodWork(fromKey: string, toKey: string, opts: { force?: boolean } = {}): Promise<Map<string, EmployeeWork>> {
  const keys = dateKeysBetween(fromKey, toKey);
  const days: DayWork[] = [];
  // Firestore'ni bir vaqtda ko'p so'rov bilan bosmaslik uchun bo'laklab.
  for (let i = 0; i < keys.length; i += 8) {
    days.push(...(await Promise.all(keys.slice(i, i + 8).map((k) => loadDayWork(k, opts)))));
  }
  const merged = new Map<string, EmployeeWork>();
  for (const day of days) {
    for (const [id, w] of Object.entries(day.employees)) {
      let target = merged.get(id);
      if (!target) {
        target = emptyWork();
        merged.set(id, target);
      }
      mergeWork(target, w);
    }
  }
  return merged;
}

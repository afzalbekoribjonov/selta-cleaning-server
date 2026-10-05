import { cashPartOf } from "./dailyActivity";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "./orderSummary";
import type { ReceiptSettings } from "./receiptSettings";

/**
 * "Kunlik hisobot cheki" — kun davomida kim nima qilgani, bazadan
 * hisoblangan holda. Natija ikki ko'rinishda:
 *  - `data` — tuzilgan raqamlar (testlar va kelajakdagi ekranlar uchun);
 *  - `blocks` — chekning TAYYOR qatorlari (logotip, matn, juftlik, chiziq).
 * Ilova ham, admin panel ham aynan shu bloklarni chizadi va chop etadi —
 * hisob bir joyda (shu yerda), ikki xil natija chiqmaydi.
 *
 * Pul qoidalari admin kunlik hisoboti bilan bir xil (routes/dailyReport.ts):
 * naqd — yetkazish, yopilgan qarz va oldindan to'lovning naqd qismi;
 * topshiriladigan — naqd minus xodimning qo'ldagi naqddan chiqimi.
 */

export type ReceiptBlock =
  | { kind: "logo" }
  | { kind: "text"; text: string; align?: "left" | "center"; bold?: boolean; large?: boolean }
  | { kind: "pair"; left: string; right: string; bold?: boolean }
  | { kind: "divider"; char?: string };

export interface DailyReceiptInput {
  dateKey: string;
  generatedAt: Date;
  names: Map<string, string>;
  /** Kunlik jurnal hodisalari (dailyActivity/{kun}/events). */
  events: Record<string, unknown>[];
  /** Shu kuni ochilgan buyurtmalar. */
  createdOrders: { createdBy: string; totalPrice: number }[];
  /** Shu kuni sexga kelgan buyurtmalar (kim olib kelgani). */
  pickedUpOrders: { pickedUpBy: string }[];
  /** Xodimlarning qo'ldagi naqddan chiqimlari (employeeId → summa). */
  cashExpenses: Map<string, number>;
  /** Kassaga topshirgan xodimlar. */
  handedOver: Set<string>;
  settings: ReceiptSettings;
}

interface UnitTotal {
  unit: string;
  amount: number;
}

const UNIT_LABELS: Record<string, string> = { sqm: "m2", meter: "metr", kg: "kg", dona: "dona" };
const UNIT_ORDER = ["sqm", "meter", "kg", "dona"];
const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${rounded < 0 ? "-" : ""}${digits} so'm`;
}

function formatAmount(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function unitsText(units: Map<string, number>): string {
  return UNIT_ORDER.filter((u) => (units.get(u) ?? 0) > 0)
    .map((u) => `${formatAmount(units.get(u)!)} ${UNIT_LABELS[u]}`)
    .join(", ");
}

function unitList(units: Map<string, number>): UnitTotal[] {
  return UNIT_ORDER.filter((u) => (units.get(u) ?? 0) > 0).map((u) => ({
    unit: UNIT_LABELS[u],
    amount: Math.round(units.get(u)! * 100) / 100,
  }));
}

function two(n: number) {
  return String(n).padStart(2, "0");
}

/** "2026-10-06" → "06.10.2026 (Dushanba)" */
function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${two(d)}.${two(m)}.${y} (${weekday})`;
}

/** Biznes vaqtida (UTC+5) "06.10.2026 18:45". */
function businessStamp(at: Date): string {
  const t = new Date(at.getTime() + 5 * 60 * 60_000);
  return `${two(t.getUTCDate())}.${two(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${two(t.getUTCHours())}:${two(t.getUTCMinutes())}`;
}

interface WorkerRow {
  washed: Map<string, number>;
  washedCount: number;
  packed: Map<string, number>;
  packedCount: number;
}

interface DriverRow {
  broughtIn: number;
  deliveredOrders: Set<string>;
  deliveredItems: number;
  cash: number;
  card: number;
}

export function buildDailyReceipt(input: DailyReceiptInput) {
  const name = (id: string) => input.names.get(id) ?? "Noma'lum";

  // --- Sotuv: ochilgan buyurtmalar ---
  const sales = new Map<string, { count: number; total: number }>();
  for (const o of input.createdOrders) {
    if (!o.createdBy) continue;
    const row = sales.get(o.createdBy) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += o.totalPrice || 0;
    sales.set(o.createdBy, row);
  }

  // --- Ishchilar va dastavchiklar: jurnaldan ---
  const workers = new Map<string, WorkerRow>();
  const drivers = new Map<string, DriverRow>();
  const worker = (id: string) => {
    let w = workers.get(id);
    if (!w) workers.set(id, (w = { washed: new Map(), washedCount: 0, packed: new Map(), packedCount: 0 }));
    return w;
  };
  const driver = (id: string) => {
    let d = drivers.get(id);
    if (!d) drivers.set(id, (d = { broughtIn: 0, deliveredOrders: new Set(), deliveredItems: 0, cash: 0, card: 0 }));
    return d;
  };

  for (const e of input.events) {
    const id = (e.employeeId as string | undefined) ?? "";
    if (!id) continue;
    const type = e.type as string;
    if (type === "washed" || type === "packed") {
      const calcType = (e.calcType as string | null) ?? null;
      const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
      const amount = unitAmountOf(calcType, e.qty as number | null);
      const w = worker(id);
      const map = type === "washed" ? w.washed : w.packed;
      map.set(unit, (map.get(unit) ?? 0) + amount);
      if (type === "washed") w.washedCount += 1;
      else w.packedCount += 1;
    } else if (type === "delivered" || type === "onsite_done") {
      const d = driver(id);
      d.deliveredOrders.add((e.orderId as string) ?? "");
      d.deliveredItems += 1;
      d.cash += cashPartOf(e as never);
      d.card += (e.cardAmount as number | null) ?? 0;
    } else if (type === "settled" || type === "prepaid") {
      const d = driver(id);
      d.cash += cashPartOf({ ...(e as object), price: 0 } as never);
      d.card += (e.cardAmount as number | null) ?? 0;
    }
  }
  for (const o of input.pickedUpOrders) {
    if (o.pickedUpBy) driver(o.pickedUpBy).broughtIn += 1;
  }
  for (const id of input.cashExpenses.keys()) driver(id);

  const byName = <T>(m: Map<string, T>) => [...m.entries()].sort((a, b) => name(a[0]).localeCompare(name(b[0])));

  // --- Tuzilgan ma'lumot ---
  const salesRows = byName(sales).map(([id, r]) => ({ employeeId: id, name: name(id), ordersCreated: r.count, ordersTotal: Math.round(r.total) }));
  const workerRows = byName(workers).map(([id, w]) => ({
    employeeId: id,
    name: name(id),
    washed: unitList(w.washed),
    washedCount: w.washedCount,
    packed: unitList(w.packed),
    packedCount: w.packedCount,
  }));
  const driverRows = byName(drivers).map(([id, d]) => {
    const expenses = input.cashExpenses.get(id) ?? 0;
    return {
      employeeId: id,
      name: name(id),
      broughtIn: d.broughtIn,
      deliveredOrders: d.deliveredOrders.size,
      deliveredItems: d.deliveredItems,
      cash: Math.round(d.cash),
      card: Math.round(d.card),
      expenses: Math.round(expenses),
      handOver: Math.round(d.cash - expenses),
      handedOver: input.handedOver.has(id),
    };
  });

  const sumUnits = (key: "washed" | "packed") => {
    const m = new Map<string, number>();
    for (const w of workers.values()) for (const [u, a] of w[key]) m.set(u, (m.get(u) ?? 0) + a);
    return m;
  };
  const washedAll = sumUnits("washed");
  const packedAll = sumUnits("packed");
  const totals = {
    ordersCreated: salesRows.reduce((s, r) => s + r.ordersCreated, 0),
    ordersTotal: salesRows.reduce((s, r) => s + r.ordersTotal, 0),
    broughtIn: input.pickedUpOrders.length,
    washed: unitList(washedAll),
    packed: unitList(packedAll),
    deliveredOrders: driverRows.reduce((s, r) => s + r.deliveredOrders, 0),
    cash: driverRows.reduce((s, r) => s + r.cash, 0),
    card: driverRows.reduce((s, r) => s + r.card, 0),
    expenses: driverRows.reduce((s, r) => s + r.expenses, 0),
    handOver: driverRows.filter((r) => !r.handedOver).reduce((s, r) => s + r.handOver, 0),
  };

  // --- Chek bloklari ---
  const s = input.settings;
  const blocks: ReceiptBlock[] = [];
  if (s.showLogo) blocks.push({ kind: "logo" });
  if (s.title) blocks.push({ kind: "text", text: s.title, align: "center", bold: true, large: true });
  blocks.push({ kind: "text", text: "KUNLIK HISOBOT", align: "center", bold: true });
  blocks.push({ kind: "divider", char: "=" });
  blocks.push({ kind: "pair", left: "Sana:", right: dayLabel(input.dateKey), bold: true });
  blocks.push({ kind: "pair", left: "Chop etildi:", right: businessStamp(input.generatedAt) });

  const section = (title: string) => {
    blocks.push({ kind: "divider", char: "=" });
    blocks.push({ kind: "text", text: title, bold: true });
  };

  section("SOTUV MENEJERLARI");
  if (salesRows.length === 0) blocks.push({ kind: "text", text: "Yangi buyurtma ochilmadi" });
  for (const r of salesRows) {
    blocks.push({ kind: "pair", left: r.name, right: `${r.ordersCreated} ta buyurtma`, bold: true });
    blocks.push({ kind: "pair", left: "  summa:", right: formatMoney(r.ordersTotal) });
  }

  section("ISHCHILAR");
  if (workerRows.length === 0) blocks.push({ kind: "text", text: "Yuvish/upakovka qayd etilmadi" });
  for (const [id, w] of byName(workers)) {
    blocks.push({ kind: "text", text: name(id), bold: true });
    if (w.washedCount > 0) blocks.push({ kind: "pair", left: "  Yuvdi:", right: unitsText(w.washed) });
    if (w.packedCount > 0) blocks.push({ kind: "pair", left: "  Upakovka qildi:", right: unitsText(w.packed) });
  }

  section("DASTAVCHIKLAR VA KASSA");
  if (driverRows.length === 0) blocks.push({ kind: "text", text: "Olib kelish/yetkazish qayd etilmadi" });
  for (const r of driverRows) {
    blocks.push({ kind: "text", text: r.name, bold: true });
    if (r.broughtIn > 0) blocks.push({ kind: "pair", left: "  Olib keldi:", right: `${r.broughtIn} ta buyurtma` });
    if (r.deliveredOrders > 0) {
      blocks.push({ kind: "pair", left: "  Yetkazdi:", right: `${r.deliveredOrders} ta (${r.deliveredItems} mahsulot)` });
    }
    if (r.cash !== 0) blocks.push({ kind: "pair", left: "  Naqd:", right: formatMoney(r.cash) });
    if (r.card !== 0) blocks.push({ kind: "pair", left: "  Karta:", right: formatMoney(r.card) });
    if (r.expenses > 0) blocks.push({ kind: "pair", left: "  Naqddan chiqim:", right: formatMoney(-r.expenses) });
    if (r.cash !== 0 || r.expenses > 0) {
      blocks.push({
        kind: "pair",
        left: r.handedOver ? "  Topshirdi:" : r.handOver < 0 ? "  Unga qaytariladi:" : "  Topshiradi:",
        right: formatMoney(Math.abs(r.handOver)),
        bold: true,
      });
    }
  }

  section("JAMI");
  blocks.push({ kind: "pair", left: "Yangi buyurtmalar:", right: `${totals.ordersCreated} ta` });
  blocks.push({ kind: "pair", left: "Sexga keldi:", right: `${totals.broughtIn} ta` });
  blocks.push({ kind: "pair", left: "Yuvildi:", right: unitsText(washedAll) || "0" });
  blocks.push({ kind: "pair", left: "Upakovka:", right: unitsText(packedAll) || "0" });
  blocks.push({ kind: "pair", left: "Yetkazildi:", right: `${totals.deliveredOrders} ta` });
  blocks.push({ kind: "pair", left: "Naqd:", right: formatMoney(totals.cash) });
  blocks.push({ kind: "pair", left: "Karta:", right: formatMoney(totals.card) });
  if (totals.expenses > 0) blocks.push({ kind: "pair", left: "Naqddan chiqim:", right: formatMoney(-totals.expenses) });
  blocks.push({ kind: "pair", left: "Topshirilishi kerak:", right: formatMoney(totals.handOver), bold: true });
  blocks.push({ kind: "divider", char: "=" });

  return {
    data: { date: input.dateKey, sales: salesRows, workers: workerRows, drivers: driverRows, totals },
    blocks,
  };
}

import { Timestamp } from "firebase-admin/firestore";
import { db } from "../admin";
import { businessDateString, businessDayRangeUtc } from "../businessTime";
import { cashPartOf, dailyActivityEvents } from "../dailyActivity";
import { loadEmployeeDirectory, type EmployeeInfo } from "../employeeNames";
import { loadEmployeeExpenses } from "../expenses";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "../orderSummary";
import { TARIFF_KEYS } from "../tariffConfig";

/**
 * Telegram botining kunlik hisoboti uchun ma'lumot — admin panelidagi
 * "Kunlik ko'rsatkichlar" (routes/dailyReport.ts) bilan AYNAN bir xil
 * manba va qoidalar:
 *
 *  - yuvildi / qadoqlandi / yetkazildi / pul — `dailyActivity/{kun}`
 *    jurnalidan (bitta so'rov);
 *  - ochilgan buyurtmalar — `createdAt` shu kuni;
 *  - sexga olib kelingan — `pickedUpAt` shu kuni;
 *  - chegirma / qarz — `payments` (`dateKey` shu kun);
 *  - mahsulot tarifi — buyurtmadagi `itemsMirror` nusxasidan (har bir
 *    buyurtma bitta o'qish, mahsulotlar pastki jamlanmasi o'qilmaydi).
 *
 * Hisoblash (`buildDayReport`) toza funksiya — Firestore'siz sinovdan
 * o'tadi; o'qish (`loadDayReport`) qisqa keshda: bir nechta admin bir
 * vaqtda so'rasa ham baza bir marta o'qiladi.
 */

export const UNIT_KEYS = ["sqm", "meter", "kg", "dona"] as const;
export type UnitKey = (typeof UNIT_KEYS)[number];
export type Units = Record<UnitKey, number>;

/** Tarifsiz mahsulotlar kaliti (eski yozuvlar). */
export const NO_TARIFF = "none";
export const REPORT_TARIFFS: string[] = [...TARIFF_KEYS];

export interface Stage {
  items: number;
  orderIds: Set<string>;
  orderNumbers: Set<number>;
  units: Units;
  price: number;
}

export interface TariffStages {
  washed: Stage;
  packed: Stage;
  delivered: Stage;
}

export interface DispatcherRow {
  id: string;
  name: string;
  isDispatcher: boolean;
  orderNumbers: number[];
  total: number;
}

export interface WorkerRow {
  id: string;
  name: string;
  department: string;
  washed: Stage;
  washedByTariff: Map<string, Stage>;
  packed: Stage;
  onsite: { orders: number; price: number };
}

export interface ProductRow {
  name: string;
  intake: Stage;
  washed: Stage;
  packed: Stage;
  delivered: Stage;
}

export interface CountAmount {
  count: number;
  amount: number;
}

export interface DriverRow {
  id: string;
  name: string;
  department: string;
  pickedUpOrderNumbers: number[];
  pickedUpItems: number;
  delivered: Stage;
  onsite: { orders: number; price: number };
  /** Mijozlardan bugun olingan jami pul (yetkazish + yopilgan qarz + oldindan to'lov). */
  collected: number;
  cash: number;
  card: number;
  settled: number;
  prepaid: number;
  discount: CountAmount;
  debt: CountAmount;
  partial: CountAmount;
  cashExpenses: number;
  /** Kassaga topshiriladigan naqd; manfiy — kompaniya xodimga qarzdor. */
  cashInHand: number;
}

export interface DayReport {
  dateKey: string;
  generatedAt: Date;
  isToday: boolean;
  created: { orders: number; total: number };
  intake: { orders: number; items: number };
  washed: Stage;
  packed: Stage;
  delivered: Stage;
  onsiteDone: { orders: number; price: number };
  tariffs: Map<string, TariffStages>;
  /** Mahsulot nomi bo'yicha: sexga keldi / yuvildi / qadoqlandi / yetkazildi. */
  products: ProductRow[];
  dispatchers: DispatcherRow[];
  workers: WorkerRow[];
  drivers: DriverRow[];
  money: {
    collected: number;
    cash: number;
    card: number;
    discount: number;
    debt: number;
    /** Shu kungi chiqimlar (xodimlarniki va adminning bir martalik chiqimlari). */
    expenses: { total: number; items: ExpenseItem[] };
    /** Tushum minus chiqimlar. */
    net: number;
  };
}

export interface ExpenseItem {
  name: string;
  /** Xodim ismi; adminning chiqimida `null`. */
  who: string | null;
  amount: number;
  /** Xodim qo'lidagi (mijozdan olingan) naqddan to'langan. */
  fromCash: boolean;
}

// ------------------------------------------------------------- KIRISH

export interface RawEvent {
  type: string;
  orderId: string;
  orderNumber: number;
  itemId: string | null;
  itemName: string | null;
  calcType: string | null;
  qty: number | null;
  price: number | null;
  employeeId: string;
  collectedAmount: number | null;
  cashAmount: number | null;
  cardAmount: number | null;
}

export interface RawOrder {
  id: string;
  orderNumber: number;
  serviceType: string;
  tariff: string | null;
  createdBy: string;
  createdAtKey: string | null;
  pickedUpBy: string;
  pickedUpAtKey: string | null;
  intakeMethod: string | null;
  itemCount: number;
  totalPrice: number;
  /** itemId -> tarif (`itemsMirror` dan). */
  itemTariffs: Map<string, string>;
  /** Mahsulotlar nusxasi (`itemsMirror`) — sexga kelganlarni nom bo'yicha sanash uchun. */
  items: RawOrderItem[];
}

export interface RawOrderItem {
  id: string;
  name: string;
  calcType: string | null;
  qty: number | null;
  price: number;
}

export interface RawPayment {
  employeeId: string;
  kind: string;
  shortfall: number;
}

export interface RawExpense {
  /** Bo'sh — adminning chiqimi. */
  employeeId: string;
  name: string;
  amount: number;
  fromCash: boolean;
}

export interface DayReportInput {
  dateKey: string;
  now: Date;
  events: RawEvent[];
  orders: Map<string, RawOrder>;
  payments: RawPayment[];
  expenses: RawExpense[];
  employees: Map<string, EmployeeInfo>;
}

// ------------------------------------------------------------ HISOBLASH

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyUnits(): Units {
  return { sqm: 0, meter: 0, kg: 0, dona: 0 };
}

export function emptyStage(): Stage {
  return { items: 0, orderIds: new Set(), orderNumbers: new Set(), units: emptyUnits(), price: 0 };
}

function emptyTariffStages(): TariffStages {
  return { washed: emptyStage(), packed: emptyStage(), delivered: emptyStage() };
}

/** "Standard" (eski yozuv) -> "standart"; noma'lum yoki bo'sh -> "none". */
export function normalizeTariff(raw: unknown): string {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (t === "standard") return "standart";
  return (REPORT_TARIFFS as string[]).includes(t) ? t : NO_TARIFF;
}

function unitOf(calcType: string | null): UnitKey {
  const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
  return (UNIT_KEYS as readonly string[]).includes(unit) ? (unit as UnitKey) : "dona";
}

function addToStage(stage: Stage, e: RawEvent): void {
  stage.items += 1;
  stage.orderIds.add(e.orderId);
  if (e.orderNumber) stage.orderNumbers.add(e.orderNumber);
  const unit = unitOf(e.calcType);
  stage.units[unit] = round2(stage.units[unit] + unitAmountOf(e.calcType, e.qty));
  stage.price += e.price ?? 0;
}

const nameOf = (employees: Map<string, EmployeeInfo>, id: string) =>
  employees.get(id)?.name ?? (id ? "Admin" : "Noma'lum");

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function buildDayReport(input: DayReportInput): DayReport {
  const { events, orders, employees } = input;

  const tariffs = new Map<string, TariffStages>();
  for (const t of REPORT_TARIFFS) tariffs.set(t, emptyTariffStages());
  const tariffStages = (t: string) => {
    let s = tariffs.get(t);
    if (!s) {
      s = emptyTariffStages();
      tariffs.set(t, s);
    }
    return s;
  };
  const tariffOfEvent = (e: RawEvent) => {
    const order = orders.get(e.orderId);
    return normalizeTariff((e.itemId && order?.itemTariffs.get(e.itemId)) ?? order?.tariff);
  };

  const washed = emptyStage();
  const packed = emptyStage();
  const delivered = emptyStage();
  const onsiteDone = { orders: 0, price: 0 };
  const money = { collected: 0, cash: 0, card: 0, discount: 0, debt: 0 };

  // --- Xodim qatorlari ---
  const workers = new Map<string, WorkerRow>();
  const worker = (id: string): WorkerRow => {
    let row = workers.get(id);
    if (!row) {
      row = {
        id,
        name: nameOf(employees, id),
        department: employees.get(id)?.department ?? "",
        washed: emptyStage(),
        washedByTariff: new Map(),
        packed: emptyStage(),
        onsite: { orders: 0, price: 0 },
      };
      workers.set(id, row);
    }
    return row;
  };

  const drivers = new Map<string, DriverRow>();
  const driver = (id: string): DriverRow => {
    let row = drivers.get(id);
    if (!row) {
      row = {
        id,
        name: nameOf(employees, id),
        department: employees.get(id)?.department ?? "",
        pickedUpOrderNumbers: [],
        pickedUpItems: 0,
        delivered: emptyStage(),
        onsite: { orders: 0, price: 0 },
        collected: 0,
        cash: 0,
        card: 0,
        settled: 0,
        prepaid: 0,
        discount: { count: 0, amount: 0 },
        debt: { count: 0, amount: 0 },
        partial: { count: 0, amount: 0 },
        cashExpenses: 0,
        cashInHand: 0,
      };
      drivers.set(id, row);
    }
    return row;
  };

  // Faol ishchi va dastavchiklar ish qilmagan bo'lsa ham ro'yxatda turadi
  // ("bugun ish qayd etilmagan" — bu ham ma'lumot).
  for (const [id, info] of employees) {
    if (info.status !== "active") continue;
    if (info.department === "worker") worker(id);
    if (info.department === "delivery") driver(id);
  }

  for (const e of events) {
    const amount = e.collectedAmount ?? e.price ?? 0;
    switch (e.type) {
      case "washed": {
        addToStage(washed, e);
        const t = tariffOfEvent(e);
        addToStage(tariffStages(t).washed, e);
        if (e.employeeId) {
          const row = worker(e.employeeId);
          addToStage(row.washed, e);
          let stage = row.washedByTariff.get(t);
          if (!stage) {
            stage = emptyStage();
            row.washedByTariff.set(t, stage);
          }
          addToStage(stage, e);
        }
        break;
      }
      case "packed":
        addToStage(packed, e);
        addToStage(tariffStages(tariffOfEvent(e)).packed, e);
        if (e.employeeId) addToStage(worker(e.employeeId).packed, e);
        break;
      case "delivered": {
        addToStage(delivered, e);
        addToStage(tariffStages(tariffOfEvent(e)).delivered, e);
        money.collected += amount;
        money.cash += cashPartOf(e);
        money.card += e.cardAmount ?? 0;
        if (e.employeeId) {
          const row = driver(e.employeeId);
          addToStage(row.delivered, e);
          row.collected += amount;
          row.cash += cashPartOf(e);
          row.card += e.cardAmount ?? 0;
        }
        break;
      }
      case "onsite_done": {
        onsiteDone.orders += 1;
        onsiteDone.price += e.price ?? 0;
        money.collected += amount;
        money.cash += cashPartOf(e);
        money.card += e.cardAmount ?? 0;
        if (e.employeeId) {
          const dept = employees.get(e.employeeId)?.department;
          if (dept === "worker") {
            const w = worker(e.employeeId);
            w.onsite.orders += 1;
            w.onsite.price += e.price ?? 0;
          }
          // Pul kimda bo'lsa — kassa ro'yxatida (dastavchiklar xabari).
          const row = driver(e.employeeId);
          row.onsite.orders += 1;
          row.onsite.price += e.price ?? 0;
          row.collected += amount;
          row.cash += cashPartOf(e);
          row.card += e.cardAmount ?? 0;
        }
        break;
      }
      case "settled":
      case "prepaid": {
        const value = e.collectedAmount ?? 0;
        const cash = cashPartOf({ ...e, price: 0 });
        money.collected += value;
        money.cash += cash;
        money.card += e.cardAmount ?? 0;
        if (e.employeeId) {
          const row = driver(e.employeeId);
          row.collected += value;
          row.cash += cash;
          row.card += e.cardAmount ?? 0;
          if (e.type === "settled") row.settled += value;
          else row.prepaid += value;
        }
        break;
      }
      default:
        break;
    }
  }

  // --- Mahsulot nomlari bo'yicha ---
  const products = new Map<string, ProductRow>();
  const product = (rawName: string | null): ProductRow => {
    const name = (rawName ?? "").trim().replace(/\s+/g, " ") || "Nomsiz mahsulot";
    const key = name.toLowerCase();
    let row = products.get(key);
    if (!row) {
      row = { name, intake: emptyStage(), washed: emptyStage(), packed: emptyStage(), delivered: emptyStage() };
      products.set(key, row);
    }
    return row;
  };
  for (const e of events) {
    // Butun buyurtma bo'yicha yozuvlar (joyida yuvish, eski yakunlar) mahsulot emas.
    if (!e.itemId) continue;
    if (e.type === "washed") addToStage(product(e.itemName).washed, e);
    else if (e.type === "packed") addToStage(product(e.itemName).packed, e);
    else if (e.type === "delivered") addToStage(product(e.itemName).delivered, e);
  }

  // --- To'lov turlari (chegirma, qarz, qisman) ---
  for (const p of input.payments) {
    if (!(p.shortfall > 0)) continue;
    if (p.kind === "discount") money.discount += p.shortfall;
    if (p.kind === "debt" || p.kind === "partial") money.debt += p.shortfall;
    if (!p.employeeId) continue;
    const row = driver(p.employeeId);
    const bucket = p.kind === "discount" ? row.discount : p.kind === "debt" ? row.debt : p.kind === "partial" ? row.partial : null;
    if (bucket) {
      bucket.count += 1;
      bucket.amount += p.shortfall;
    }
  }

  // --- Chiqimlar ---
  // Hammasi kunlik kassadan ayiriladi; xodim qo'lidagi naqddan qilingani
  // yana o'sha xodimning "qo'lida naqd" qoldig'idan ham ayiriladi.
  const expenseItems: ExpenseItem[] = [];
  for (const x of input.expenses) {
    if (!(x.amount > 0)) continue;
    expenseItems.push({
      name: x.name || "Chiqim",
      who: x.employeeId ? nameOf(employees, x.employeeId) : null,
      amount: x.amount,
      fromCash: x.fromCash,
    });
    if (x.fromCash && x.employeeId) driver(x.employeeId).cashExpenses += x.amount;
  }
  expenseItems.sort((a, b) => b.amount - a.amount);
  const expensesTotal = expenseItems.reduce((sum, x) => sum + x.amount, 0);

  // --- Ochilgan va sexga olib kelingan buyurtmalar ---
  const dispatchers = new Map<string, DispatcherRow>();
  const dispatcher = (id: string): DispatcherRow => {
    let row = dispatchers.get(id);
    if (!row) {
      row = {
        id,
        name: nameOf(employees, id),
        isDispatcher: employees.get(id)?.department === "dispatcher",
        orderNumbers: [],
        total: 0,
      };
      dispatchers.set(id, row);
    }
    return row;
  };
  for (const [id, info] of employees) {
    if (info.status === "active" && info.department === "dispatcher") dispatcher(id);
  }

  let createdOrders = 0;
  let createdTotal = 0;
  let intakeOrders = 0;
  let intakeItems = 0;
  for (const o of orders.values()) {
    if (o.createdAtKey === input.dateKey) {
      createdOrders += 1;
      createdTotal += o.totalPrice;
      const row = dispatcher(o.createdBy);
      row.orderNumbers.push(o.orderNumber);
      row.total += o.totalPrice;
    }
    if (o.pickedUpAtKey === input.dateKey) {
      intakeOrders += 1;
      intakeItems += o.itemCount;
      for (const item of o.items) {
        addToStage(product(item.name).intake, {
          type: "intake",
          orderId: o.id,
          orderNumber: o.orderNumber,
          itemId: item.id,
          itemName: item.name,
          calcType: item.calcType,
          qty: item.qty,
          price: item.price,
          employeeId: "",
          collectedAmount: null,
          cashAmount: null,
          cardAmount: null,
        });
      }
      // Mijoz o'zi olib kelgan buyurtma dastavchikka yozilmaydi.
      if (o.pickedUpBy && o.intakeMethod !== "walk_in") {
        const row = driver(o.pickedUpBy);
        row.pickedUpOrderNumbers.push(o.orderNumber);
        row.pickedUpItems += o.itemCount;
      }
    }
  }

  // --- Yakuniy tartib ---
  const driverRows = [...drivers.values()]
    .map((d) => ({
      ...d,
      pickedUpOrderNumbers: [...d.pickedUpOrderNumbers].sort((a, b) => a - b),
      collected: Math.round(d.collected),
      cash: Math.round(d.cash),
      card: Math.round(d.card),
      cashInHand: Math.round(d.cash - d.cashExpenses),
    }))
    // Dastavchik bo'lmagan xodim faqat qo'lida pul bo'lsa ro'yxatga kiradi.
    .filter((d) => d.department === "delivery" || d.collected > 0 || d.cashExpenses > 0 || d.discount.count > 0 || d.debt.count > 0 || d.partial.count > 0)
    .sort((a, b) => b.delivered.orderIds.size - a.delivered.orderIds.size || b.collected - a.collected || byName(a, b));

  const workerRows = [...workers.values()].sort(
    (a, b) => b.washed.items - a.washed.items || b.packed.items - a.packed.items || byName(a, b),
  );

  const dispatcherRows = [...dispatchers.values()]
    .map((d) => ({ ...d, orderNumbers: [...d.orderNumbers].sort((a, b) => a - b) }))
    .sort((a, b) => b.orderNumbers.length - a.orderNumbers.length || byName(a, b));

  const activity = (p: ProductRow) => p.intake.items + p.washed.items + p.packed.items + p.delivered.items;
  const productRows = [...products.values()].sort((a, b) => activity(b) - activity(a) || byName(a, b));

  // Tarifsiz guruh faqat haqiqatan bo'lsa ko'rinadi (u haqiqiy tarif emas).
  const none = tariffs.get(NO_TARIFF);
  if (none && none.washed.items + none.packed.items + none.delivered.items === 0) tariffs.delete(NO_TARIFF);

  return {
    dateKey: input.dateKey,
    generatedAt: input.now,
    isToday: input.dateKey === businessDateString(input.now),
    created: { orders: createdOrders, total: Math.round(createdTotal) },
    intake: { orders: intakeOrders, items: intakeItems },
    washed,
    packed,
    delivered,
    onsiteDone,
    tariffs,
    products: productRows,
    dispatchers: dispatcherRows,
    workers: workerRows,
    drivers: driverRows,
    money: {
      collected: Math.round(money.collected),
      cash: Math.round(money.cash),
      card: Math.round(money.card),
      discount: Math.round(money.discount),
      debt: Math.round(money.debt),
      expenses: { total: Math.round(expensesTotal), items: expenseItems },
      net: Math.round(money.collected - expensesTotal),
    },
  };
}

// --------------------------------------------------------------- O'QISH

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const keyOf = (v: unknown): string | null => (v instanceof Timestamp ? businessDateString(v.toDate()) : null);

export function toRawOrder(id: string, o: Record<string, unknown>): RawOrder {
  const itemTariffs = new Map<string, string>();
  const items: RawOrderItem[] = [];
  if (Array.isArray(o.itemsMirror)) {
    for (const m of o.itemsMirror as Record<string, unknown>[]) {
      if (!m || typeof m.id !== "string") continue;
      if (typeof m.tariff === "string") itemTariffs.set(m.id, m.tariff);
      items.push({
        id: m.id,
        name: str(m.name),
        calcType: typeof m.calcType === "string" ? m.calcType : null,
        qty: num(m.qty),
        price: num(m.price) ?? 0,
      });
    }
  }
  return {
    id,
    orderNumber: num(o.orderNumber) ?? 0,
    serviceType: str(o.serviceType) || "pickup",
    tariff: typeof o.tariff === "string" ? o.tariff : null,
    createdBy: str(o.createdBy),
    createdAtKey: keyOf(o.createdAt),
    pickedUpBy: str(o.pickedUpBy),
    pickedUpAtKey: keyOf(o.pickedUpAt),
    intakeMethod: typeof o.intakeMethod === "string" ? o.intakeMethod : null,
    itemCount: num(o.itemCount) ?? 0,
    totalPrice: num(o.totalPrice) ?? 0,
    itemTariffs,
    items,
  };
}

function toRawEvent(e: Record<string, unknown>): RawEvent {
  return {
    type: str(e.type),
    orderId: str(e.orderId),
    orderNumber: num(e.orderNumber) ?? 0,
    itemId: typeof e.itemId === "string" ? e.itemId : null,
    itemName: typeof e.itemName === "string" ? e.itemName : null,
    calcType: typeof e.calcType === "string" ? e.calcType : null,
    qty: num(e.qty),
    price: num(e.price),
    employeeId: str(e.employeeId),
    collectedAmount: num(e.collectedAmount),
    cashAmount: num(e.cashAmount),
    cardAmount: num(e.cardAmount),
  };
}

/** Bitta kunning hisobotini bazadan o'qib hisoblaydi (keshsiz). */
export async function computeDayReport(dateKey: string, now = new Date()): Promise<DayReport> {
  const range = businessDayRangeUtc(dateKey);
  if (!range) throw new Error(`Noto'g'ri sana: ${dateKey}`);
  const start = Timestamp.fromDate(range.start);
  const end = Timestamp.fromDate(range.end);

  const [eventsSnap, createdSnap, pickedSnap, paymentsSnap, expenses, adminExpensesSnap, employees] = await Promise.all([
    dailyActivityEvents(dateKey).get(),
    db.collection("orders").where("createdAt", ">=", start).where("createdAt", "<", end).get(),
    db.collection("orders").where("pickedUpAt", ">=", start).where("pickedUpAt", "<", end).get(),
    db.collection("payments").where("dateKey", "==", dateKey).get(),
    loadEmployeeExpenses(dateKey),
    // Adminning shu kunga yozilgan chiqimlari. Har oy takrorlanuvchilari
    // (ijara va h.k.) kunlik kassaga kirmaydi — ular oylik hisobotda.
    db.collection("expenses").where("date", ">=", start).where("date", "<", end).get(),
    loadEmployeeDirectory(),
  ]);
  const adminExpenses: RawExpense[] = adminExpensesSnap.docs
    .map((d) => d.data())
    .filter((x) => !x.employeeId && x.recurring !== true)
    .map((x) => ({ employeeId: "", name: str(x.name), amount: num(x.amount) ?? 0, fromCash: false }));

  const orders = new Map<string, RawOrder>();
  for (const doc of [...createdSnap.docs, ...pickedSnap.docs]) orders.set(doc.id, toRawOrder(doc.id, doc.data()));

  const events = eventsSnap.docs.map((d) => toRawEvent(d.data()));

  // Tarif uchun: hodisadagi buyurtmalardan hali o'qilmaganlari (bittadan o'qish).
  const missing = [...new Set(events.map((e) => e.orderId))].filter((id) => id && !orders.has(id)).slice(0, 400);
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((id) => db.collection("orders").doc(id)));
    for (const s of snaps) {
      if (s.exists) orders.set(s.id, toRawOrder(s.id, s.data() ?? {}));
    }
  }

  return buildDayReport({
    dateKey,
    now,
    events,
    orders,
    payments: paymentsSnap.docs.map((d) => {
      const p = d.data();
      return { employeeId: str(p.employeeId), kind: str(p.kind), shortfall: num(p.shortfall) ?? 0 };
    }),
    expenses: [...expenses.map((x) => ({ employeeId: x.employeeId, name: x.name, amount: x.amount, fromCash: x.fromCash })), ...adminExpenses],
    employees,
  });
}

// Bugungi hisobot 1 daqiqa, o'tgan kun 10 daqiqa keshlanadi; bir vaqtdagi
// so'rovlar bitta o'qishni kutadi.
const TODAY_TTL_MS = 60_000;
const PAST_TTL_MS = 10 * 60_000;
const reportCache = new Map<string, { at: number; report: DayReport }>();
const inFlight = new Map<string, Promise<DayReport>>();

export async function loadDayReport(dateKey: string): Promise<DayReport> {
  const now = Date.now();
  const ttl = dateKey === businessDateString(new Date(now)) ? TODAY_TTL_MS : PAST_TTL_MS;
  const hit = reportCache.get(dateKey);
  if (hit && now - hit.at < ttl) return hit.report;

  const pending = inFlight.get(dateKey);
  if (pending) return pending;

  const promise = computeDayReport(dateKey)
    .then((report) => {
      reportCache.set(dateKey, { at: Date.now(), report });
      // Kesh o'smasin: eng ko'pi 7 kun.
      if (reportCache.size > 7) reportCache.delete(reportCache.keys().next().value as string);
      return report;
    })
    .finally(() => inFlight.delete(dateKey));
  inFlight.set(dateKey, promise);
  return promise;
}

import { Timestamp } from "firebase-admin/firestore";
import { db } from "../admin";
import type { InlineKeyboard } from "./api";
import { normalizeTariff } from "./dayReport";
import { TARIFF_TITLES } from "./reportMessages";
import { businessDateString } from "../businessTime";
import { dateTime, dayMonth, esc, inScript, MESSAGE_LIMIT, money, qty, type Script } from "./text";

/**
 * /id — buyurtmani raqami bo'yicha topish va uning mahsulotlarini
 * ko'rsatish.
 *
 * O'QISH TEJAMKOR: buyurtma hujjatining o'zida mahsulotlar nusxasi
 * (`itemsMirror`) bor — kim yuvgani, qadoqlagani, topshirgani bilan.
 * Shuning uchun butun buyurtma odatda BITTA o'qish. Nusxa bo'lmagan eski
 * buyurtmada mahsulotlar pastki jamlanmasi o'qiladi.
 *
 * Natija 5 daqiqa keshda: mahsulot tugmalari va "Ortga" bosilganda baza
 * qayta o'qilmaydi. "Yangilash" tugmasi keshni chetlab o'tadi (lekin 5
 * soniyadan tez-tez emas).
 */

export interface ItemView {
  id: string;
  itemNumber: number;
  name: string;
  calcType: string | null;
  qty: number | null;
  width: number | null;
  height: number | null;
  sizeVariant: string | null;
  price: number;
  tariff: string;
  status: string;
  qcNote: string | null;
  dueDate: Date | null;
  createdAt: Date | null;
  addedBy: string | null;
  washingBy: string | null;
  washingAt: Date | null;
  washedBy: string | null;
  washedAt: Date | null;
  packedBy: string | null;
  packedAt: Date | null;
  deliveredBy: string | null;
  deliveredByName: string | null;
  deliveredAt: Date | null;
  collectedAmount: number | null;
}

export interface OrderView {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  location: string;
  serviceType: string;
  status: string;
  tariff: string | null;
  createdBy: string;
  createdAt: Date | null;
  pickedUpBy: string | null;
  pickedUpByName: string | null;
  pickedUpAt: Date | null;
  intakeMethod: string | null;
  doneAt: Date | null;
  dueDate: Date | null;
  totalPrice: number;
  paidTotal: number;
  discountTotal: number;
  debtTotal: number;
  prepaidAmount: number;
  team: string[];
  assignment: { driverName: string; date: string; kind: string } | null;
  items: ItemView[];
  loadedAt: Date;
}

// ------------------------------------------------------------- O'QISH

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function toItemView(id: string, d: Record<string, unknown>): ItemView {
  return {
    id,
    itemNumber: num(d.itemNumber) ?? 0,
    name: str(d.name) ?? "Mahsulot",
    calcType: str(d.calcType),
    qty: num(d.qty),
    width: num(d.width),
    height: num(d.height),
    sizeVariant: str(d.sizeVariant),
    price: num(d.price) ?? 0,
    tariff: normalizeTariff(d.tariff),
    status: str(d.status) ?? "pending",
    qcNote: str(d.qcNote),
    dueDate: toDate(d.dueDate),
    createdAt: toDate(d.createdAt),
    addedBy: str(d.addedBy),
    washingBy: str(d.washingBy),
    washingAt: toDate(d.washingAt),
    washedBy: str(d.washedBy),
    washedAt: toDate(d.washedAt),
    packedBy: str(d.packedBy),
    packedAt: toDate(d.packedAt),
    deliveredBy: str(d.deliveredBy),
    deliveredByName: str(d.deliveredByName),
    deliveredAt: toDate(d.deliveredAt),
    collectedAmount: num(d.collectedAmount),
  };
}

export function toOrderView(id: string, o: Record<string, unknown>, items: ItemView[], loadedAt = new Date()): OrderView {
  const a = o.assignment && typeof o.assignment === "object" ? (o.assignment as Record<string, unknown>) : null;
  return {
    id,
    orderNumber: num(o.orderNumber) ?? 0,
    customerName: str(o.customerName) ?? "",
    phone: str(o.phone) ?? "",
    location: str(o.location) ?? "",
    serviceType: str(o.serviceType) ?? "pickup",
    status: str(o.status) ?? "new",
    tariff: str(o.tariff),
    createdBy: str(o.createdBy) ?? "",
    createdAt: toDate(o.createdAt),
    pickedUpBy: str(o.pickedUpBy),
    pickedUpByName: str(o.pickedUpByName),
    pickedUpAt: toDate(o.pickedUpAt),
    intakeMethod: str(o.intakeMethod),
    doneAt: toDate(o.doneAt),
    dueDate: toDate(o.dueDate),
    totalPrice: num(o.totalPrice) ?? 0,
    paidTotal: num(o.paidTotal) ?? 0,
    discountTotal: num(o.discountTotal) ?? 0,
    debtTotal: num(o.debtTotal) ?? 0,
    prepaidAmount: num(o.prepaidAmount) ?? 0,
    team: Array.isArray(o.assignedTeam) ? (o.assignedTeam as unknown[]).filter((x): x is string => typeof x === "string") : [],
    assignment:
      a && typeof a.driverName === "string" && typeof a.date === "string"
        ? { driverName: a.driverName, date: a.date, kind: a.kind === "pickup" ? "pickup" : "delivery" }
        : null,
    items: [...items].sort((x, y) => x.itemNumber - y.itemNumber),
    loadedAt,
  };
}

async function readOrder(doc: FirebaseFirestore.DocumentSnapshot): Promise<OrderView | null> {
  if (!doc.exists) return null;
  const o = doc.data() ?? {};
  const mirror = Array.isArray(o.itemsMirror) ? (o.itemsMirror as Record<string, unknown>[]) : null;
  const itemCount = num(o.itemCount);
  let items: ItemView[];
  // Nusxa to'liq bo'lsa — qo'shimcha o'qishsiz.
  if (mirror && (itemCount === null || mirror.length === itemCount)) {
    items = mirror.filter((m) => m && typeof m.id === "string").map((m) => toItemView(m.id as string, m));
  } else {
    const snap = await doc.ref.collection("items").get();
    items = snap.docs.map((d) => toItemView(d.id, d.data()));
  }
  return toOrderView(doc.id, o, items);
}

const CACHE_TTL_MS = 5 * 60_000;
const MIN_REFRESH_MS = 5_000;
const MAX_CACHED = 150;
const byId = new Map<string, OrderView>();
const idByNumber = new Map<number, string>();

function remember(view: OrderView): OrderView {
  byId.delete(view.id);
  byId.set(view.id, view);
  idByNumber.set(view.orderNumber, view.id);
  while (byId.size > MAX_CACHED) {
    const oldest = byId.keys().next().value as string;
    const old = byId.get(oldest);
    byId.delete(oldest);
    if (old && idByNumber.get(old.orderNumber) === oldest) idByNumber.delete(old.orderNumber);
  }
  return view;
}

const fresh = (v: OrderView | undefined, force: boolean): v is OrderView => {
  if (!v) return false;
  const age = Date.now() - v.loadedAt.getTime();
  return force ? age < MIN_REFRESH_MS : age < CACHE_TTL_MS;
};

/** Buyurtma ID'si (hujjat) bo'yicha. */
export async function getOrderView(orderId: string, force = false): Promise<OrderView | null> {
  const cached = byId.get(orderId);
  if (fresh(cached, force)) return cached;
  const view = await readOrder(await db.collection("orders").doc(orderId).get());
  if (!view) {
    byId.delete(orderId);
    return null;
  }
  return remember(view);
}

/** Buyurtma raqami (#1245) bo'yicha. */
export async function findOrderByNumber(orderNumber: number): Promise<OrderView | null> {
  const knownId = idByNumber.get(orderNumber);
  const cached = knownId ? byId.get(knownId) : undefined;
  if (fresh(cached, false)) return cached;
  const snap = await db.collection("orders").where("orderNumber", "==", orderNumber).limit(1).get();
  if (snap.docs.length === 0) return null;
  const view = await readOrder(snap.docs[0]);
  return view ? remember(view) : null;
}

/** Sinovlar uchun. */
export function clearOrderCache(): void {
  byId.clear();
  idByNumber.clear();
}

// ---------------------------------------------------------- KO'RINISH

const ORDER_STATUS: Record<string, string> = {
  new: "🆕 Yangi",
  picked_up: "🚛 Olib kelinmoqda",
  brought_in: "🏭 Sexda",
  team_assigned: "👥 Jamoa biriktirildi",
  in_progress: "🔧 Jarayonda",
  done: "🏁 Yakunlangan",
};

const ITEM_STATUS: Record<string, string> = {
  pending: "⏳ Navbatda",
  washing: "🧼 Yuvilmoqda",
  packing: "📦 Qadoqlanmoqda",
  returned: "↩️ Qayta yuvishga qaytarilgan",
  ready: "✅ Tayyor",
  done: "🏁 Mijozga topshirilgan",
};

export type NameOf = (employeeId: string | null) => string | null;

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("998")) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  if (digits.length === 9) return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  return phone;
}

export function measurementOf(item: ItemView): string {
  switch (item.calcType) {
    case "sqm": {
      const base = `${qty(item.qty ?? 0)} m²`;
      return item.width !== null && item.height !== null ? `${base} (${qty(item.width)}×${qty(item.height)})` : base;
    }
    case "meter":
      return `${qty(item.qty ?? 0)} metr`;
    case "kg":
      return `${qty(item.qty ?? 0)} kg`;
    case "count":
      return `${qty(item.qty ?? 0)} dona`;
    case "size":
      return item.sizeVariant === "large" ? "Katta" : "Kichik";
    default:
      return "1 dona";
  }
}

const subId = (order: OrderView, item: ItemView) => `${order.orderNumber}/${item.itemNumber}`;

function stageLabel(order: OrderView): string {
  const base = ORDER_STATUS[order.status] ?? esc(order.status);
  if (order.serviceType !== "pickup" || order.status !== "brought_in" || order.items.length === 0) return base;
  const open = order.items.filter((i) => i.status !== "done");
  const ready = open.filter((i) => i.status === "ready").length;
  if (open.length === 0) return base;
  return ready === open.length ? "✅ Hammasi tayyor" : ready > 0 ? `${base} · ${ready}/${open.length} tayyor` : base;
}

function dayLabel(dateKey: string, now: Date): string {
  const today = businessDateString(now);
  const tomorrow = businessDateString(new Date(now.getTime() + 86_400_000));
  if (dateKey === today) return "bugun";
  if (dateKey === tomorrow) return "ertaga";
  const [y, m, d] = dateKey.split("-").map(Number);
  return dayMonth(new Date(Date.UTC(y, m - 1, d, 7)));
}

/** Callback ma'lumoti 64 baytdan oshmasligi kerak (Telegram cheklovi). */
export function itemCallback(order: OrderView, item: ItemView): string {
  const full = `i:${order.id}:${item.id}`;
  return Buffer.byteLength(full) <= 64 ? full : `i:${order.id}:#${item.itemNumber}`;
}

export function findItem(order: OrderView, ref: string): ItemView | null {
  if (ref.startsWith("#")) {
    const n = Number(ref.slice(1));
    return order.items.find((i) => i.itemNumber === n) ?? null;
  }
  return order.items.find((i) => i.id === ref) ?? null;
}

const MAX_ITEM_BUTTONS = 90;

export function renderOrder(order: OrderView, nameOf: NameOf, script: Script, now = new Date()): { text: string; keyboard: InlineKeyboard } {
  const head = [`🧾 <b>BUYURTMA #${order.orderNumber}</b>`, `Holati: <b>${stageLabel(order)}</b>`].join("\n");

  const customer = [
    `👤 <b>${esc(order.customerName || "Noma'lum mijoz")}</b>`,
    order.phone ? `📞 ${esc(formatPhone(order.phone))}` : null,
    order.location ? `📍 ${esc(order.location)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const flow: string[] = [];
  flow.push(
    `📝 Qabul qildi: ${esc(nameOf(order.createdBy) ?? "—")}${order.createdAt ? ` · ${dateTime(order.createdAt)}` : ""}`,
  );
  if (order.serviceType === "onsite") {
    flow.push(`🏠 Xizmat: Joyida yuvish${order.tariff ? ` · ${TARIFF_TITLES[normalizeTariff(order.tariff)] ?? ""}` : ""}`);
    if (order.team.length) flow.push(`👥 Jamoa: ${order.team.map((id) => esc(nameOf(id) ?? "Xodim")).join(", ")}`);
    if (order.dueDate && order.status !== "done") flow.push(`⏰ Muddat: ${dayMonth(order.dueDate)}`);
  } else if (order.intakeMethod === "walk_in") {
    flow.push(`🚶 Mijoz o'zi olib keldi${order.pickedUpAt ? ` · ${dateTime(order.pickedUpAt)}` : ""}`);
  } else if (order.pickedUpAt) {
    flow.push(
      `🚛 Olib keldi: ${esc(order.pickedUpByName ?? nameOf(order.pickedUpBy) ?? "—")} · ${dateTime(order.pickedUpAt)}`,
    );
  }
  if (order.assignment && order.status !== "done") {
    flow.push(
      `🗂 Topshiriq: ${esc(order.assignment.driverName)} · ${dayLabel(order.assignment.date, now)} ${
        order.assignment.kind === "pickup" ? "olib keladi" : "yetkazadi"
      }`,
    );
  }
  if (order.doneAt) flow.push(`🏁 Yakunlandi: ${dateTime(order.doneAt)}`);

  // Mahsulotlar — xabar chegarasiga sig'maganlari tugmalarda qoladi.
  const itemLines: string[] = [];
  let shown = 0;
  let budget = MESSAGE_LIMIT - 900 - head.length - customer.length - flow.join("\n").length;
  for (const item of order.items) {
    const line = [
      `<b>${subId(order, item)}</b> · ${esc(item.name)}`,
      `└ ${esc(measurementOf(item))} · ${TARIFF_TITLES[item.tariff] ?? ""} · <b>${money(item.price)}</b> · ${ITEM_STATUS[item.status] ?? esc(item.status)}`,
    ].join("\n");
    if (line.length + 1 > budget) break;
    budget -= line.length + 1;
    itemLines.push(line);
    shown += 1;
  }
  const hidden = order.items.length - shown;

  const items =
    order.items.length === 0
      ? order.serviceType === "onsite"
        ? "📦 Joyida yuvish — mahsulotlar alohida qayd etilmaydi"
        : "📦 Mahsulotlar hali qo'shilmagan"
      : [
          `📦 <b>Mahsulotlar (${order.items.length})</b>`,
          itemLines.join("\n"),
          hidden > 0 ? `<i>… va yana ${hidden} ta — tugmalar orqali ko'ring</i>` : null,
        ]
          .filter(Boolean)
          .join("\n");

  const payments = [`💵 <b>Jami: ${money(order.totalPrice)}</b>`];
  const payLines: string[] = [];
  if (order.paidTotal > 0) payLines.push(`To'langan: ${money(order.paidTotal)}`);
  if (order.prepaidAmount > 0) payLines.push(`Oldindan to'lov: ${money(order.prepaidAmount)}`);
  if (order.discountTotal > 0) payLines.push(`Chegirma: ${money(order.discountTotal)}`);
  if (order.debtTotal > 0) payLines.push(`Qarz: ${money(order.debtTotal)}`);
  payLines.forEach((line, i) => payments.push(`${i === payLines.length - 1 ? "└" : "├"} ${line}`));

  const footer = order.items.length > 0 ? "👇 <i>Mahsulot tafsilotlari uchun uning raqamini bosing</i>" : null;

  const text = [head, customer, flow.join("\n"), items, payments.join("\n"), footer].filter(Boolean).join("\n\n");

  const keyboard: InlineKeyboard = [];
  const buttons = order.items.slice(0, MAX_ITEM_BUTTONS).map((item) => ({ text: subId(order, item), callback_data: itemCallback(order, item) }));
  for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2));
  keyboard.push([{ text: inScript("🔄 Yangilash", script), callback_data: `r:${order.id}` }]);

  return { text: inScript(text, script), keyboard };
}

function stageLine(icon: string, label: string, who: string | null, at: Date | null, extra = ""): string {
  if (!who && !at) return `${icon} ${label}: —`;
  if (!who) return `${icon} ${label}: ${dateTime(at!)}${extra}`;
  return `${icon} ${label}: <b>${esc(who)}</b>${at ? ` · ${dateTime(at)}` : ""}${extra}`;
}

/**
 * Mahsulotni kim qo'shgani. Nusxada (`itemsMirror`) bu maydon yo'q; agar
 * mahsulot buyurtma bilan birga (5 daqiqa ichida) yaratilgan bo'lsa — bu
 * buyurtmani qabul qilgan xodim, aks holda ism ko'rsatilmaydi (taxmin
 * qilinmaydi).
 */
function addedByOf(order: OrderView, item: ItemView, nameOf: NameOf): string | null {
  if (item.addedBy) return nameOf(item.addedBy);
  if (item.createdAt && order.createdAt && Math.abs(item.createdAt.getTime() - order.createdAt.getTime()) < 5 * 60_000) {
    return nameOf(order.createdBy);
  }
  return null;
}

export function renderItem(order: OrderView, item: ItemView, nameOf: NameOf, script: Script): { text: string; keyboard: InlineKeyboard } {
  const head = [
    `🔖 <b>${subId(order, item)} · ${esc(item.name)}</b>`,
    `🧾 Buyurtma #${order.orderNumber}${order.customerName ? ` · ${esc(order.customerName)}` : ""}`,
  ].join("\n");

  const facts = [
    `📏 O'lcham: ${esc(measurementOf(item))}`,
    `🏷 Tarif: ${TARIFF_TITLES[item.tariff] ?? "—"}`,
    `💵 Narxi: <b>${money(item.price)}</b>`,
    `📍 Holati: ${ITEM_STATUS[item.status] ?? esc(item.status)}`,
  ];
  if (item.dueDate && item.status !== "done") facts.push(`⏰ Muddat: ${dayMonth(item.dueDate)}`);
  if (item.qcNote && (item.status === "returned" || item.status === "washing")) {
    facts.push(`↩️ Qaytarish sababi: <i>${esc(item.qcNote)}</i>`);
  }

  const washingNow = item.status === "washing" && !item.washedBy && item.washingBy;
  const flow = [
    `🛠 <b>Ish jarayoni</b>`,
    stageLine("➕", "Qo'shildi", addedByOf(order, item, nameOf), item.createdAt),
    washingNow
      ? stageLine("🧼", "Yuvmoqda", nameOf(item.washingBy), item.washingAt)
      : stageLine("🧼", "Yuvdi", item.washedBy ? nameOf(item.washedBy) : null, item.washedAt),
    stageLine("📦", "Qadoqladi", item.packedBy ? nameOf(item.packedBy) : null, item.packedAt),
    stageLine(
      "🚚",
      "Topshirdi",
      item.deliveredBy || item.deliveredByName ? item.deliveredByName ?? nameOf(item.deliveredBy) : null,
      item.deliveredAt,
      item.collectedAmount !== null && item.deliveredAt ? ` · ${money(item.collectedAmount)} olindi` : "",
    ),
  ];

  const text = [head, facts.join("\n"), flow.join("\n")].join("\n\n");

  const index = order.items.findIndex((i) => i.id === item.id);
  const nav = [];
  const prev = index > 0 ? order.items[index - 1] : null;
  const next = index >= 0 && index < order.items.length - 1 ? order.items[index + 1] : null;
  if (prev) nav.push({ text: `◀️ ${subId(order, prev)}`, callback_data: itemCallback(order, prev) });
  if (next) nav.push({ text: `${subId(order, next)} ▶️`, callback_data: itemCallback(order, next) });

  const keyboard: InlineKeyboard = [];
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: inScript("⬅️ Buyurtmaga qaytish", script), callback_data: `o:${order.id}` }]);

  return { text: inScript(text, script), keyboard };
}

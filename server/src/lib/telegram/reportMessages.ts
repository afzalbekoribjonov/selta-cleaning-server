import type { DayReport, DriverRow, Stage, Units, WorkerRow } from "./dayReport";
import { NO_TARIFF, REPORT_TARIFFS, UNIT_KEYS } from "./dayReport";
import { dayMonth, esc, hhmm, inScript, int, longDateOfKey, money, packBlocks, qty, type Script } from "./text";

/**
 * Kunlik hisobotning oltita xabari. Har biri alohida yuboriladi (talab);
 * juda uzun bo'lsa (masalan o'nlab xodim) o'zi bir nechta xabarga
 * bo'linadi — lekin hech qachon blok o'rtasidan emas.
 *
 * Matn lotinda yoziladi va kerak bo'lsa oxirida kirillga o'giriladi
 * (text.ts: toCyrillic) — ikki nusxani qo'lda yuritish xato manbai bo'lardi.
 */

export const TARIFF_TITLES: Record<string, string> = {
  express: "⚡ Express",
  comfort: "🍃 Comfort",
  standart: "🔹 Standart",
  premium: "💎 Premium",
  [NO_TARIFF]: "▫️ Tarifsiz",
};

const UNIT_LABELS: Record<string, string> = { sqm: "m²", meter: "metr", kg: "kg", dona: "dona" };
const UNIT_TITLES: Record<string, string> = { sqm: "m²", meter: "Metr", kg: "Kg", dona: "Dona" };

const DEPARTMENT_LABELS: Record<string, string> = {
  dispatcher: "Sotuv menejeri",
  worker: "Ishchi",
  delivery: "Dastavchik",
  supervisor: "Nazoratchi",
};

/** "m² 32,5 · metr 0 · kg 0 · dona 1" — barcha birliklar, nol ham. */
export function unitsLine(units: Units): string {
  return UNIT_KEYS.map((u) => `${UNIT_LABELS[u]} ${qty(units[u])}`).join(" · ");
}

/** Faqat nol bo'lmagan birliklar; hammasi nol bo'lsa "—". */
function nonZeroUnits(units: Units): string {
  const parts = UNIT_KEYS.filter((u) => units[u] > 0).map((u) => `${UNIT_LABELS[u]} ${qty(units[u])}`);
  return parts.length ? parts.join(" · ") : "—";
}

function orderIds(numbers: Iterable<number>): string {
  return [...numbers]
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
    .map((n) => `#${n}`)
    .join(", ");
}

function header(icon: string, title: string, report: DayReport): string {
  const when = report.isToday ? `🕐 ${hhmm(report.generatedAt)} holatiga` : "🕐 Kun yakuni";
  return `${icon} <b>${title}</b>\n🗓 ${dayMonth(dateOfKey(report.dateKey))} · ${when}`;
}

function dateOfKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Biznes kuni yarmi (UTC+5 bo'yicha 12:00) — kun hech qachon siljimaydi.
  return new Date(Date.UTC(y, m - 1, d, 7));
}

function departmentNote(department: string, expected: string): string {
  if (!department || department === expected) return "";
  const label = DEPARTMENT_LABELS[department];
  return label ? ` <i>(${label})</i>` : "";
}

/** Daraxt ko'rinishidagi qatorlar: "├ ..." va oxirgisi "└ ...". */
function tree(lines: string[]): string {
  return lines.map((line, i) => `${i === lines.length - 1 ? "└" : "├"} ${line}`).join("\n");
}

// -------------------------------------------------------------- 1. UMUMIY

function summaryMessage(r: DayReport): string[] {
  const lines = [
    `📝 Qabul qilingan buyurtmalar: <b>${int(r.created.orders)} ta</b>`,
    `🚛 Sexga olib kelingan: <b>${int(r.intake.orders)} ta</b> buyurtma · ${int(r.intake.items)} ta mahsulot`,
    `🧼 Yuvilgan mahsulotlar: <b>${int(r.washed.items)} ta</b>`,
    `📦 Qadoqlangan buyurtmalar: <b>${int(r.packed.orderIds.size)} ta</b> · ${int(r.packed.items)} ta mahsulot`,
    `✅ Yetkazilgan buyurtmalar: <b>${int(r.delivered.orderIds.size)} ta</b> · ${int(r.delivered.items)} ta mahsulot`,
  ];
  if (r.onsiteDone.orders > 0) {
    lines.push(`🏠 Joyida yuvish yakunlandi: <b>${int(r.onsiteDone.orders)} ta</b> · ${money(r.onsiteDone.price)}`);
  }

  const cash = [
    `💵 <b>Kassa</b>`,
    tree([
      `Jami tushum: <b>${money(r.money.collected)}</b>`,
      `Naqd: ${money(r.money.cash)}`,
      `Karta: ${money(r.money.card)}`,
      `Chegirma: ${money(r.money.discount)}`,
      `Qarzga qoldi: ${money(r.money.debt)}`,
    ]),
  ].join("\n");

  return packBlocks([
    `📊 <b>KUNLIK HISOBOT</b>\n🗓 ${longDateOfKey(r.dateKey)}\n${r.isToday ? `🕐 ${hhmm(r.generatedAt)} holatiga` : "🕐 Kun yakuni"}`,
    lines.join("\n"),
    cash,
  ]);
}

// -------------------------------------------------- 2. YUVILGAN — HAJM, NARX

function stageBlock(title: string, stage: Stage): string {
  return [
    `${title}`,
    tree([
      `Soni: <b>${int(stage.items)} ta</b>`,
      `Hajm: ${unitsLine(stage.units)}`,
      `Narxi: <b>${money(stage.price)}</b>`,
    ]),
  ].join("\n");
}

function washedMessage(r: DayReport): string[] {
  const total = [
    `<b>Jami:</b> ${int(r.washed.items)} ta mahsulot`,
    `💵 <b>Narxi: ${money(r.washed.price)}</b>`,
    "",
    `📐 <b>Hajm</b>`,
    tree(UNIT_KEYS.map((u) => `${UNIT_TITLES[u]}: <b>${qty(r.washed.units[u])}</b>`)),
  ].join("\n");

  const tariffBlocks = [...r.tariffs.entries()].map(([key, t]) => stageBlock(`<b>${TARIFF_TITLES[key] ?? esc(key)}</b>`, t.washed));

  return packBlocks([header("🧼", "YUVILGAN MAHSULOTLAR", r), total, `🏷 <b>Tariflar bo'yicha</b>`, ...tariffBlocks]);
}

// -------------------------------------------------------- 3. SOTUV MENEJERLARI

function dispatchersMessage(r: DayReport): string[] {
  const intro = `Ochilgan buyurtmalar: <b>${int(r.created.orders)} ta</b>`;
  const blocks = r.dispatchers.map((d) => {
    const name = `👤 <b>${esc(d.name)}</b>${d.isDispatcher ? "" : ` <i>(${d.name === "Admin" ? "Admin" : "boshqa bo'lim"})</i>`}`;
    if (d.orderNumbers.length === 0) return `${name}\n└ Buyurtma ochmadi`;
    return `${name}\n${tree([`Buyurtmalar: <b>${int(d.orderNumbers.length)} ta</b>`, `ID: ${orderIds(d.orderNumbers)}`])}`;
  });
  if (blocks.length === 0) blocks.push("Faol sotuv menejeri yo'q");
  return packBlocks([header("🧾", "SOTUV MENEJERLARI", r), intro, ...blocks]);
}

// ---------------------------------------------------------------- 4. ISHCHILAR

function workerBlock(w: WorkerRow): string {
  const title = `👤 <b>${esc(w.name)}</b>${departmentNote(w.department, "worker")}`;
  if (w.washed.items === 0 && w.packed.items === 0 && w.onsite.orders === 0) {
    return `${title}\n└ Ish qayd etilmagan`;
  }

  const lines: string[] = [title];
  if (w.washed.items > 0) {
    lines.push(`🧼 Yuvdi: <b>${int(w.washed.items)} ta</b> · <b>${money(w.washed.price)}</b>`);
    const sub = [`Hajm: ${unitsLine(w.washed.units)}`];
    for (const key of [...REPORT_TARIFFS, NO_TARIFF]) {
      const s = w.washedByTariff.get(key);
      if (!s || s.items === 0) continue;
      sub.push(`${TARIFF_TITLES[key]}: ${int(s.items)} ta · ${nonZeroUnits(s.units)} · ${money(s.price)}`);
    }
    lines.push(tree(sub));
  } else {
    lines.push("🧼 Yuvdi: 0 ta");
  }
  lines.push(
    w.packed.items > 0
      ? `📦 Qadoqladi: <b>${int(w.packed.items)} ta</b> · ${nonZeroUnits(w.packed.units)} · ${money(w.packed.price)}`
      : "📦 Qadoqladi: 0 ta",
  );
  if (w.onsite.orders > 0) lines.push(`🏠 Joyida yuvish: <b>${int(w.onsite.orders)} ta</b> · ${money(w.onsite.price)}`);
  return lines.join("\n");
}

function workersMessage(r: DayReport): string[] {
  const blocks = r.workers.map(workerBlock);
  if (blocks.length === 0) blocks.push("Faol ishchi yo'q");
  return packBlocks([header("🧑‍🔧", "ISHCHILAR", r), ...blocks]);
}

// ---------------------------------------------------------------- 5. TARIFLAR

function tariffsMessage(r: DayReport): string[] {
  const blocks = [...r.tariffs.entries()].map(([key, t]) =>
    [
      `<b>${(TARIFF_TITLES[key] ?? esc(key)).toUpperCase()}</b>`,
      `🧼 Yuvildi: <b>${int(t.washed.items)} ta</b> · ${money(t.washed.price)}`,
      `└ ${unitsLine(t.washed.units)}`,
      `📦 Qadoqlandi: <b>${int(t.packed.items)} ta</b> · ${money(t.packed.price)}`,
      `└ ${unitsLine(t.packed.units)}`,
      `✅ Yetkazildi: <b>${int(t.delivered.items)} ta</b> · ${money(t.delivered.price)}`,
      `└ ${unitsLine(t.delivered.units)}`,
    ].join("\n"),
  );
  return packBlocks([header("🏷", "TARIFLAR BO'YICHA", r), ...blocks]);
}

// ------------------------------------------------------------- 6. DASTAVCHIKLAR

function driverBlock(d: DriverRow): string {
  const title = `👤 <b>${esc(d.name)}</b>${departmentNote(d.department, "delivery")}`;
  const idle =
    d.pickedUpOrderNumbers.length === 0 &&
    d.delivered.items === 0 &&
    d.onsite.orders === 0 &&
    d.collected === 0 &&
    d.cashExpenses === 0 &&
    d.discount.count + d.debt.count + d.partial.count === 0;
  if (idle) return `${title}\n└ Ish qayd etilmagan`;

  const lines: string[] = [title];

  if (d.department === "delivery" || d.pickedUpOrderNumbers.length > 0) {
    lines.push(`📥 Olib keldi: <b>${int(d.pickedUpOrderNumbers.length)} ta</b> buyurtma · ${int(d.pickedUpItems)} ta mahsulot`);
    if (d.pickedUpOrderNumbers.length > 0) lines.push(`└ ${orderIds(d.pickedUpOrderNumbers)}`);
  }

  if (d.department === "delivery" || d.delivered.items > 0) {
    lines.push(`✅ Yetkazdi: <b>${int(d.delivered.orderIds.size)} ta</b> buyurtma · ${int(d.delivered.items)} ta mahsulot`);
    if (d.delivered.items > 0) {
      lines.push(
        tree([`Hajm: ${unitsLine(d.delivered.units)}`, `Narxi: ${money(d.delivered.price)}`, `ID: ${orderIds(d.delivered.orderNumbers)}`]),
      );
    }
  }

  if (d.onsite.orders > 0) lines.push(`🏠 Joyida yuvish: <b>${int(d.onsite.orders)} ta</b> · ${money(d.onsite.price)}`);

  const moneyLines = [
    `💵 Naqd: ${money(d.cash)}`,
    `💳 Karta orqali: ${money(d.card)}`,
    `🏷 Chegirma: ${money(d.discount.amount)}${d.discount.count ? ` (${int(d.discount.count)} ta)` : ""}`,
    `⏳ Qarzga qoldi: ${money(d.debt.amount + d.partial.amount)}${d.debt.count + d.partial.count ? ` (${int(d.debt.count + d.partial.count)} ta)` : ""}`,
  ];
  if (d.settled > 0) moneyLines.push(`↩️ Yopilgan qarzlar: ${money(d.settled)}`);
  if (d.prepaid > 0) moneyLines.push(`💼 Oldindan to'lov: ${money(d.prepaid)}`);
  if (d.cashExpenses > 0) moneyLines.push(`⛽ Naqddan chiqim: ${money(-d.cashExpenses)}`);

  lines.push(`💰 Mijozlardan olindi: <b>${money(d.collected)}</b>`);
  lines.push(tree(moneyLines));
  lines.push(
    d.cashInHand < 0
      ? `👛 <b>Unga qaytariladi: ${money(-d.cashInHand)}</b>`
      : `👛 <b>Qo'lida naqd: ${money(d.cashInHand)}</b>`,
  );
  return lines.join("\n");
}

function driversMessage(r: DayReport): string[] {
  const blocks = r.drivers.map(driverBlock);
  if (blocks.length === 0) blocks.push("Faol dastavchik yo'q");
  return packBlocks([header("🚚", "DASTAVCHIKLAR", r), ...blocks]);
}

/**
 * Oltita hisobot — har biri bir yoki bir nechta Telegram xabari
 * (uzunligiga qarab). Tanlangan yozuvda.
 */
export function renderDayReport(report: DayReport, script: Script): string[][] {
  return [
    summaryMessage(report),
    washedMessage(report),
    dispatchersMessage(report),
    workersMessage(report),
    tariffsMessage(report),
    driversMessage(report),
  ].map((group) => group.map((text) => inScript(text, script)));
}

import type { DayReport, DriverRow, Stage, Units, WorkerRow } from "./dayReport";
import { NO_TARIFF, REPORT_TARIFFS, UNIT_KEYS } from "./dayReport";
import { dayMonth, esc, hhmm, inScript, int, longDateOfKey, money, packBlocks, qty, type Script } from "./text";

/**
 * Kunlik hisobotning yettita xabari. Har biri alohida yuboriladi (talab);
 * juda uzun bo'lsa (masalan o'nlab xodim) o'zi bir nechta xabarga
 * bo'linadi — lekin hech qachon blok o'rtasidan emas.
 *
 * Ko'rinish qoidalari (foydalanuvchi talabi bilan):
 *  - har bir ko'rsatkich o'z qatorida, "nomi — qiymati";
 *  - hajm birliklari bitta qatorga tiqilmaydi — har biri alohida qator;
 *  - bloklar orasida bo'sh qator, emoji faqat sarlavhada;
 *  - ichki qatorlar daraxt belgisi bilan emas, oddiy chekinish bilan.
 *
 * Matn lotinda yoziladi va kerak bo'lsa oxirida kirillga o'giriladi
 * (text.ts: toCyrillic) — ikki nusxani qo'lda yuritish xato manbai bo'lardi.
 */

/** Tarif nomlari — hisobotda ham, buyurtma ko'rinishida ham. */
export const TARIFF_NAMES: Record<string, string> = {
  express: "Express",
  comfort: "Comfort",
  standart: "Standart",
  premium: "Premium",
  [NO_TARIFF]: "Tarifsiz",
};

const UNIT_LABELS: Record<string, string> = { sqm: "m²", meter: "metr", kg: "kg", dona: "dona" };

const DEPARTMENT_LABELS: Record<string, string> = {
  dispatcher: "Sotuv menejeri",
  worker: "Ishchi",
  delivery: "Dastavchik",
  supervisor: "Nazoratchi",
};

/** Ichki qatorlar chekinishi — uzilmaydigan bo'shliqlar (Telegram ularni o'chirmaydi). */
const IN = "    ";

/** Odamlar orasidagi yengil ajratgich (blok ichida bo'sh qatorlar bo'lganda). */
const DIVIDER = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈";

/** "Yuvildi — <b>8 ta</b>" */
const row = (label: string, value: string) => `${label} — ${value}`;
const sub = (label: string, value: string) => `${IN}${label} — ${value}`;

/** Barcha birliklar, har biri alohida qatorda (nol ham ko'rsatiladi). */
export function unitLines(units: Units): string[] {
  return UNIT_KEYS.map((u) => sub(UNIT_LABELS[u], qty(units[u])));
}

/** Faqat nol bo'lmaganlari bitta qisqa iborada: "83,45 m² + 4 dona"; hammasi nol — "". */
export function volume(units: Units): string {
  return UNIT_KEYS.filter((u) => units[u] > 0)
    .map((u) => `${qty(units[u])} ${UNIT_LABELS[u]}`)
    .join(" + ");
}

function orderIds(numbers: Iterable<number>): string {
  return [...numbers]
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
    .map((n) => `#${n}`)
    .join(", ");
}

function dateOfKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Biznes kuni yarmi (UTC+5 bo'yicha 12:00) — kun hech qachon siljimaydi.
  return new Date(Date.UTC(y, m - 1, d, 7));
}

function stamp(r: DayReport): string {
  return r.isToday ? `${hhmm(r.generatedAt)} holatiga` : "kun yakuni";
}

function header(icon: string, title: string, r: DayReport): string {
  return `${icon} <b>${title}</b>\n<i>${dayMonth(dateOfKey(r.dateKey))} · ${stamp(r)}</i>`;
}

function departmentNote(department: string, expected: string): string {
  if (!department || department === expected) return "";
  const label = DEPARTMENT_LABELS[department];
  return label ? ` <i>(${label})</i>` : "";
}

/** "8 ta · 1 585 550 so'm" yoki narxsiz "0 ta". */
function countAndPrice(stage: Stage): string {
  return stage.items > 0 ? `<b>${int(stage.items)} ta</b> · ${money(stage.price)}` : "0 ta";
}

// -------------------------------------------------------------- 1. UMUMIY

function summaryMessage(r: DayReport): string[] {
  const head = `📊 <b>KUNLIK HISOBOT</b>\n<i>${longDateOfKey(r.dateKey)}</i>\n<i>${stamp(r)}</i>`;

  const orders = [
    "<b>Buyurtmalar</b>",
    row("Qabul qilindi", `<b>${int(r.created.orders)} ta</b>`),
    row("Sexga olib kelindi", `<b>${int(r.intake.orders)} ta</b>`),
    row("Qadoqlandi", `<b>${int(r.packed.orderIds.size)} ta</b>`),
    row("Yetkazildi", `<b>${int(r.delivered.orderIds.size)} ta</b>`),
  ];
  if (r.onsiteDone.orders > 0) orders.push(row("Joyida yuvish yakunlandi", `<b>${int(r.onsiteDone.orders)} ta</b>`));

  const items = [
    "<b>Mahsulotlar</b>",
    row("Sexga keldi", `<b>${int(r.intake.items)} ta</b>`),
    row("Yuvildi", `<b>${int(r.washed.items)} ta</b>`),
    row("Qadoqlandi", `<b>${int(r.packed.items)} ta</b>`),
    row("Yetkazildi", `<b>${int(r.delivered.items)} ta</b>`),
  ];

  const m = r.money;
  const cash = [
    "💰 <b>KASSA</b>",
    "",
    row("Tushum", `<b>${money(m.collected)}</b>`),
    sub("naqd", money(m.cash)),
    sub("karta", money(m.card)),
    "",
    row("Chiqimlar", `<b>${money(m.expenses.total)}</b>`),
  ];
  const shown = m.expenses.items.slice(0, 12);
  for (const x of shown) {
    cash.push(sub(`${esc(x.name)}${x.who ? ` <i>(${esc(x.who)})</i>` : ""}`, money(x.amount)));
  }
  if (m.expenses.items.length > shown.length) {
    cash.push(`${IN}<i>… va yana ${m.expenses.items.length - shown.length} ta</i>`);
  }
  cash.push("", `<b>${row("Qoldiq", money(m.net))}</b>`, `<i>${IN}tushumdan chiqimlar ayirilgan</i>`);

  const other = [row("Chegirma", money(m.discount)), row("Qarzga qoldi", money(m.debt))];

  return packBlocks([head, orders.join("\n"), items.join("\n"), cash.join("\n"), other.join("\n")]);
}

// -------------------------------------------------- 2. YUVILGAN — HAJM, NARX

function washedMessage(r: DayReport): string[] {
  const total = [
    row("Jami", `<b>${int(r.washed.items)} ta mahsulot</b>`),
    row("Narxi", `<b>${money(r.washed.price)}</b>`),
    "",
    "<b>Hajm</b>",
    ...unitLines(r.washed.units),
  ].join("\n");

  const tariffBlocks = [...r.tariffs.entries()].map(([key, t]) =>
    [`<b>${TARIFF_NAMES[key] ?? esc(key)}</b> — ${countAndPrice(t.washed)}`, ...unitLines(t.washed.units)].join("\n"),
  );

  return packBlocks([header("🧼", "YUVILGAN MAHSULOTLAR", r), total, "<b>TARIFLAR BO'YICHA</b>", ...tariffBlocks]);
}

// -------------------------------------------------------- 3. SOTUV MENEJERLARI

function dispatchersMessage(r: DayReport): string[] {
  const intro = row("Jami ochilgan buyurtmalar", `<b>${int(r.created.orders)} ta</b>`);
  const blocks = r.dispatchers.map((d) => {
    const note = d.isDispatcher ? "" : ` <i>(${d.name === "Admin" ? "admin" : "boshqa bo'lim"})</i>`;
    if (d.orderNumbers.length === 0) return `<b>${esc(d.name)}</b>${note}\n${IN}Bugun buyurtma ochmadi`;
    return `<b>${esc(d.name)}</b>${note} — <b>${int(d.orderNumbers.length)} ta</b>\n${IN}${orderIds(d.orderNumbers)}`;
  });
  if (blocks.length === 0) blocks.push("Faol sotuv menejeri yo'q");
  return packBlocks([header("🧾", "SOTUV MENEJERLARI", r), intro, ...blocks]);
}

// ---------------------------------------------------------------- 4. ISHCHILAR

function workerBlock(w: WorkerRow): string {
  const title = `<b>${esc(w.name)}</b>${departmentNote(w.department, "worker")}`;
  if (w.washed.items === 0 && w.packed.items === 0 && w.onsite.orders === 0) {
    return `${title}\n${IN}Ish qayd etilmagan`;
  }

  const lines: string[] = [title];
  lines.push(row("Yuvdi", countAndPrice(w.washed)));
  if (w.washed.items > 0) {
    const v = volume(w.washed.units);
    if (v) lines.push(sub("hajm", v));
    for (const key of [...REPORT_TARIFFS, NO_TARIFF]) {
      const s = w.washedByTariff.get(key);
      if (!s || s.items === 0) continue;
      const parts = [`${int(s.items)} ta`, volume(s.units), money(s.price)].filter(Boolean);
      lines.push(sub(TARIFF_NAMES[key], parts.join(" · ")));
    }
  }
  lines.push(row("Qadoqladi", countAndPrice(w.packed)));
  if (w.packed.items > 0) {
    const v = volume(w.packed.units);
    if (v) lines.push(sub("hajm", v));
  }
  if (w.onsite.orders > 0) lines.push(row("Joyida yuvish", `<b>${int(w.onsite.orders)} ta</b> · ${money(w.onsite.price)}`));
  return lines.join("\n");
}

function workersMessage(r: DayReport): string[] {
  const blocks = r.workers.map(workerBlock);
  if (blocks.length === 0) blocks.push("Faol ishchi yo'q");
  return packBlocks([header("🧑‍🔧", "ISHCHILAR", r), ...blocks]);
}

// ---------------------------------------------------------------- 5. TARIFLAR

function stageLines(label: string, stage: Stage): string[] {
  const lines = [row(label, countAndPrice(stage))];
  const v = volume(stage.units);
  if (v) lines.push(sub("hajm", v));
  return lines;
}

function tariffsMessage(r: DayReport): string[] {
  const blocks = [...r.tariffs.entries()].map(([key, t]) =>
    [
      `<b>${(TARIFF_NAMES[key] ?? esc(key)).toUpperCase()}</b>`,
      ...stageLines("Yuvildi", t.washed),
      ...stageLines("Qadoqlandi", t.packed),
      ...stageLines("Yetkazildi", t.delivered),
    ].join("\n"),
  );
  return packBlocks([header("🏷", "TARIFLAR BO'YICHA", r), ...blocks]);
}

// ------------------------------------------------------------- 6. DASTAVCHIKLAR

function driverBlock(d: DriverRow): string {
  const title = `<b>${esc(d.name)}</b>${departmentNote(d.department, "delivery")}`;
  const idle =
    d.pickedUpOrderNumbers.length === 0 &&
    d.delivered.items === 0 &&
    d.onsite.orders === 0 &&
    d.collected === 0 &&
    d.cashExpenses === 0 &&
    d.discount.count + d.debt.count + d.partial.count === 0;
  if (idle) return `${title}\n${IN}Ish qayd etilmagan`;

  const work: string[] = [title];
  if (d.department === "delivery" || d.pickedUpOrderNumbers.length > 0) {
    work.push(
      row(
        "Olib keldi",
        d.pickedUpOrderNumbers.length > 0
          ? `<b>${int(d.pickedUpOrderNumbers.length)} ta</b> buyurtma · ${int(d.pickedUpItems)} ta mahsulot`
          : "0 ta",
      ),
    );
    if (d.pickedUpOrderNumbers.length > 0) work.push(`${IN}${orderIds(d.pickedUpOrderNumbers)}`);
  }
  if (d.department === "delivery" || d.delivered.items > 0) {
    work.push(
      row(
        "Yetkazdi",
        d.delivered.items > 0
          ? `<b>${int(d.delivered.orderIds.size)} ta</b> buyurtma · ${int(d.delivered.items)} ta mahsulot`
          : "0 ta",
      ),
    );
    if (d.delivered.items > 0) {
      const v = volume(d.delivered.units);
      if (v) work.push(sub("hajm", v));
      work.push(sub("narxi", money(d.delivered.price)));
      work.push(`${IN}${orderIds(d.delivered.orderNumbers)}`);
    }
  }
  if (d.onsite.orders > 0) work.push(row("Joyida yuvish", `<b>${int(d.onsite.orders)} ta</b> · ${money(d.onsite.price)}`));

  const cash: string[] = [
    row("Mijozlardan olindi", `<b>${money(d.collected)}</b>`),
    sub("naqd", money(d.cash)),
    sub("karta", money(d.card)),
    sub("chegirma", `${money(d.discount.amount)}${d.discount.count ? ` (${int(d.discount.count)} ta)` : ""}`),
    sub(
      "qarzga qoldi",
      `${money(d.debt.amount + d.partial.amount)}${d.debt.count + d.partial.count ? ` (${int(d.debt.count + d.partial.count)} ta)` : ""}`,
    ),
  ];
  if (d.settled > 0) cash.push(sub("yopilgan qarzlar", money(d.settled)));
  if (d.prepaid > 0) cash.push(sub("oldindan to'lov", money(d.prepaid)));
  if (d.cashExpenses > 0) cash.push(sub("naqddan chiqim", money(-d.cashExpenses)));

  const inHand =
    d.cashInHand < 0
      ? `<b>${row("Unga qaytariladi", money(-d.cashInHand))}</b>`
      : `<b>${row("Qo'lida naqd", money(d.cashInHand))}</b>`;

  return [work.join("\n"), cash.join("\n"), inHand].join("\n\n");
}

function driversMessage(r: DayReport): string[] {
  const blocks = r.drivers.map((d, i) => (i === 0 ? driverBlock(d) : `${DIVIDER}

${driverBlock(d)}`));
  if (blocks.length === 0) blocks.push("Faol dastavchik yo'q");
  return packBlocks([header("🚚", "DASTAVCHIKLAR", r), ...blocks]);
}

// ------------------------------------------------------------ 7. MAHSULOTLAR

/** "12 ta · 86,4 m² · 960 000 so'm" — narx nol bo'lsa (hali o'lchanmagan) ko'rsatilmaydi. */
function productStage(label: string, stage: Stage): string {
  if (stage.items === 0) return row(label, "0 ta");
  const parts = [`<b>${int(stage.items)} ta</b>`, volume(stage.units), stage.price > 0 ? money(stage.price) : ""].filter(Boolean);
  return row(label, parts.join(" · "));
}

function productsMessage(r: DayReport): string[] {
  const blocks = r.products.map((p) =>
    [
      `<b>${esc(p.name)}</b>`,
      productStage("Sexga keldi", p.intake),
      productStage("Yuvildi", p.washed),
      productStage("Qadoqlandi", p.packed),
      productStage("Yetkazildi", p.delivered),
    ].join("\n"),
  );
  if (blocks.length === 0) blocks.push("Bugun mahsulotlar bo'yicha harakat yo'q");
  return packBlocks([
    header("📦", "MAHSULOTLAR BO'YICHA", r),
    "<i>Sexga kelganlar narxi — hozirgi o'lchov bo'yicha; o'lchanmaganlari narxsiz.</i>",
    ...blocks,
  ]);
}

/**
 * Yettita hisobot — har biri bir yoki bir nechta Telegram xabari
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
    productsMessage(report),
  ].map((group) => group.map((text) => inScript(text, script)));
}

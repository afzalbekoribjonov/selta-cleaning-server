import { EMPTY_RATES, rateFor, type ProductRates, type RateStage } from "./productRates";
import { countOf, unitTotals, type EmployeeWork, type Lines, type Unit } from "./workSummary";

/**
 * Maosh hisobi — TOZA funksiya (Firestore'siz, sinovdan o'tadi).
 *
 * Har bir usul ikki qismdan iborat:
 *  - ISHBAY (o'zgaruvchan) — tanlangan oraliqdagi ishdan: yuvilgan va
 *    qadoqlangan hajm × MAHSULOT narxi, ochilgan buyurtmalar summasidan
 *    foiz va h.k. Istalgan kun yoki oraliq uchun aniq hisoblanadi;
 *  - OYLIK FIKSA (qattiq qism) — oyiga bir marta. Faqat kalendar oyi
 *    tanlanganda jamiga qo'shiladi, aks holda alohida ko'rsatiladi.
 *
 * Ishbay narxlari mahsulotda (Mahsulotlar bo'limi, lib/productRates.ts):
 * har bir mahsulotning 1 birligi (m², metr, kg, dona) uchun yuvish va
 * qadoqlash narxi. Xodim profilida faqat usul va fiksa summasi qoladi.
 *
 * Qayta yuvish (sifat nazoratidan qaytgan mahsulotni yana yuvish) uchun
 * haq TO'LANMAYDI — u `rewashed` qatorlarida alohida sanaladi.
 */

export interface SalaryConfig {
  method: string;
  params: Record<string, number>;
}

export interface PayLine {
  label: string;
  /** "33 ta · 162,6 m² · 28 metr" kabi izoh (so'mda emas). */
  detail: string;
  amount: number;
}

export interface PayResult {
  method: string;
  /** Oraliqdagi ishbay qismi. */
  variable: number;
  /** Oylik qattiq qism (fiksa). */
  base: number;
  /** Fiksa jamiga qo'shilganmi (faqat oy tanlanganda). */
  baseIncluded: boolean;
  /** Shu oy uchun berilgan avanslar (faqat oy tanlanganda ayiriladi). */
  advances: number;
  total: number;
  lines: PayLine[];
}

/** Mahsulot narxlari bo'yicha ishbay hisoblanadigan usullar. */
export const PIECEWORK_METHODS = new Set(["washing", "finishing"]);

const UNIT_LABELS: Record<Unit, string> = { sqm: "m²", meter: "metr", kg: "kg", dona: "dona" };

const round = (n: number) => Math.round(n);

function qtyText(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

function moneyText(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function unitsText(lines: Lines): string {
  const totals = unitTotals(lines);
  return (Object.keys(UNIT_LABELS) as Unit[])
    .filter((u) => totals[u] > 0)
    .map((u) => `${qtyText(totals[u])} ${UNIT_LABELS[u]}`)
    .join(" · ");
}

/**
 * Bosqich ishbayi: har bir qator hajmi × shu mahsulotning narxi. Narxi
 * kiritilmagan mahsulotlar 0 so'm, lekin alohida qatorda nomi bilan
 * ko'rsatiladi — admin darhol qaysi narx yetishmayotganini ko'radi.
 */
function pieceLines(label: string, lines: Lines, rates: ProductRates, stage: RateStage): PayLine[] {
  const list = Object.values(lines);
  if (list.length === 0) return [];
  let amount = 0;
  const missing = new Set<string>();
  for (const line of list) {
    const rate = rateFor(rates, line, stage);
    if (rate === null) missing.add(line.name);
    else amount += line.amount * rate;
  }
  const out: PayLine[] = [{ label, detail: `${countOf(lines)} ta · ${unitsText(lines)}`, amount: round(amount) }];
  if (missing.size > 0) {
    const names = [...missing];
    out.push({
      label: `${label}: narxi kiritilmagan`,
      detail: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` va yana ${names.length - 3} ta` : ""} — Mahsulotlar bo'limida kiriting`,
      amount: 0,
    });
  }
  return out;
}

export function computePay(
  salary: SalaryConfig | null,
  work: EmployeeWork,
  opts: { month: boolean; advances: number; rates?: ProductRates },
): PayResult | null {
  if (!salary?.method) return null;
  const p = salary.params ?? {};
  const rates = opts.rates ?? EMPTY_RATES;
  const lines: PayLine[] = [];
  let base = 0;

  switch (salary.method) {
    case "fixed":
      base = p.fixedAmount ?? 0;
      break;
    case "fixed_percent": {
      base = p.baseAmount ?? 0;
      const percent = p.percent ?? 0;
      lines.push({
        label: "Ochilgan buyurtmalardan foiz",
        detail: `${work.created.orders} ta buyurtma · ${moneyText(work.created.revenue)} so'm × ${qtyText(percent)}%`,
        amount: round((work.created.revenue * percent) / 100),
      });
      break;
    }
    case "delivery": {
      base = p.baseAmount ?? 0;
      const value = work.deliveredMoney.value + work.onsite.revenue;
      const collected = work.deliveredMoney.collected + work.onsite.collected;
      const p1 = p.percentOfOrderValue ?? 0;
      const p2 = p.percentOfCashCollected ?? 0;
      lines.push({
        label: "Yetkazilganlar summasidan",
        detail: `${moneyText(value)} so'm × ${qtyText(p1)}%`,
        amount: round((value * p1) / 100),
      });
      lines.push({
        label: "Yig'ilgan puldan",
        detail: `${moneyText(collected)} so'm × ${qtyText(p2)}%`,
        amount: round((collected * p2) / 100),
      });
      break;
    }
    case "washing":
    case "finishing":
      // Ishbay: o'zi yuvgan VA qadoqlagan mahsulotlar — mahsulot narxlari
      // bo'yicha. "washing" — fiksa + ishbay, "finishing" — faqat ishbay.
      base = salary.method === "washing" ? (p.baseAmount ?? 0) : 0;
      lines.push(...pieceLines("Yuvish", work.washed, rates, "wash"), ...pieceLines("Qadoqlash", work.packed, rates, "pack"));
      if (lines.length === 0) lines.push({ label: "Ishbay", detail: "Shu davrda ish yo'q", amount: 0 });
      break;
    case "furniture_onsite_percent": {
      const percent = p.percent ?? 0;
      lines.push({
        label: "Joyida yuvish summasidan",
        detail: `${work.onsiteTeam.orders} ta buyurtma · ${moneyText(work.onsiteTeam.revenue)} so'm × ${qtyText(percent)}%`,
        amount: round((work.onsiteTeam.revenue * percent) / 100),
      });
      break;
    }
    default:
      return { method: salary.method, variable: 0, base: 0, baseIncluded: false, advances: 0, total: 0, lines: [] };
  }

  const variable = lines.reduce((s, l) => s + l.amount, 0);
  const advances = opts.month ? opts.advances : 0;
  const total = variable + (opts.month ? base : 0) - advances;
  return { method: salary.method, variable, base, baseIncluded: opts.month, advances, total, lines };
}

/** Xodim shu davrda umuman ish qilganmi (ro'yxatda ko'rsatish uchun). */
export function hasWork(w: EmployeeWork): boolean {
  return (
    countOf(w.washed) + countOf(w.packed) + countOf(w.delivered) + countOf(w.returned) + countOf(w.rewashed) > 0 ||
    w.created.orders + w.pickedUp.orders + w.onsite.orders + w.onsiteTeam.orders + w.deliveredMoney.orders > 0
  );
}

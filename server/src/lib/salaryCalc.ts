import { countOf, unitTotals, type EmployeeWork, type Lines, type Unit } from "./workSummary";

/**
 * Maosh hisobi — TOZA funksiya (Firestore'siz, sinovdan o'tadi).
 *
 * Har bir usul ikki qismdan iborat:
 *  - ISHBAY (o'zgaruvchan) — tanlangan oraliqdagi ishdan: yuvilgan hajm ×
 *    birlik narxi, ochilgan buyurtmalar summasidan foiz va h.k. Istalgan
 *    kun yoki oraliq uchun aniq hisoblanadi;
 *  - OYLIK BAZA (qattiq qism) — oyiga bir marta. Faqat kalendar oyi
 *    tanlanganda jamiga qo'shiladi, aks holda alohida ko'rsatiladi
 *    (bir kun uchun oylikni bo'lib qo'yish noto'g'ri tasavvur berardi).
 *
 * Birlik narxlari: avval faqat 1 m² narxi bor edi — metr, kg va donalik
 * mahsulotlar uchun ishbay 0 chiqardi. Endi har bir birlik o'z narxiga
 * ega (berilmagani 0).
 */

export interface SalaryConfig {
  method: string;
  params: Record<string, number>;
}

export interface PayLine {
  label: string;
  /** "213,66 m² × 1 500" kabi izoh (so'mda emas). */
  detail: string;
  amount: number;
}

export interface PayResult {
  method: string;
  /** Oraliqdagi ishbay qismi. */
  variable: number;
  /** Oylik qattiq qism (baza / fiksa). */
  base: number;
  /** Baza jamiga qo'shilganmi (faqat oy tanlanganda). */
  baseIncluded: boolean;
  /** Shu oy uchun berilgan avanslar (faqat oy tanlanganda ayiriladi). */
  advances: number;
  total: number;
  lines: PayLine[];
}

export const UNIT_RATE_KEYS: Record<Unit, string> = {
  sqm: "pricePerSqm",
  meter: "pricePerMeter",
  kg: "pricePerKg",
  dona: "pricePerPiece",
};

const UNIT_LABELS: Record<Unit, string> = { sqm: "m²", meter: "metr", kg: "kg", dona: "dona" };

const round = (n: number) => Math.round(n);

function qtyText(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

function moneyText(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Hajm × birlik narxi — har bir birlik alohida qator. */
function unitRateLines(label: string, lines: Lines, params: Record<string, number>): PayLine[] {
  const totals = unitTotals(lines);
  const out: PayLine[] = [];
  for (const unit of Object.keys(UNIT_RATE_KEYS) as Unit[]) {
    const amount = totals[unit];
    if (!(amount > 0)) continue;
    const rate = params[UNIT_RATE_KEYS[unit]] ?? 0;
    out.push({
      label: `${label} (${UNIT_LABELS[unit]})`,
      detail: rate > 0 ? `${qtyText(amount)} ${UNIT_LABELS[unit]} × ${moneyText(rate)}` : `${qtyText(amount)} ${UNIT_LABELS[unit]} — narx belgilanmagan`,
      amount: round(amount * rate),
    });
  }
  if (out.length === 0) out.push({ label, detail: "Shu davrda ish yo'q", amount: 0 });
  return out;
}

export function computePay(
  salary: SalaryConfig | null,
  work: EmployeeWork,
  opts: { month: boolean; advances: number },
): PayResult | null {
  if (!salary?.method) return null;
  const p = salary.params ?? {};
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
      base = p.baseAmount ?? 0;
      lines.push(...unitRateLines("Yuvish", work.washed, p));
      break;
    case "finishing":
      // Pardozlash — mahsulotni yakunlab qadoqlash bosqichi (qadoqlagan
      // xodim). Avval xato ravishda yuvilgan mahsulotlardan hisoblanardi.
      lines.push(...unitRateLines("Pardozlash", work.packed, p));
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
    countOf(w.washed) + countOf(w.packed) + countOf(w.delivered) + countOf(w.returned) > 0 ||
    w.created.orders + w.pickedUp.orders + w.onsite.orders + w.onsiteTeam.orders + w.deliveredMoney.orders > 0
  );
}

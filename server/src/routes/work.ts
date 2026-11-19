import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc } from "../lib/businessTime";
import { computePay, hasWork, type PayResult, type SalaryConfig } from "../lib/salaryCalc";
import {
  addLine,
  emptyWork,
  loadPeriodWork,
  type EmployeeWork,
  type Lines,
  type WorkLine,
} from "../lib/workSummary";

/**
 * "Maosh va statistika" — istalgan kun yoki oraliq uchun har bir xodimning
 * ishi (mahsulot × tarif × hajm), ishbay puli va (oy tanlansa) oylik maoshi.
 * "Hisoblash" tugmasi shart emas: sahifa ochilganda shu so'rov chaqiriladi,
 * natija lib/workSummary.ts keshi tufayli arzon.
 *
 * Oy tanlanganda (1-sanadan oy oxirigacha, joriy oyda — bugungacha) natija
 * `employees/{id}/payrollRuns/{yyyy-MM}` ga ham yoziladi — xodim profilidagi
 * maosh tarixi va oylik hisobot shundan o'qiydi. Faqat o'zgargan yozuv
 * yangilanadi (keraksiz yozuv yo'q).
 */
export const workRouter = Router();

const MAX_RANGE_DAYS = 93;
const DEPARTMENT_ORDER = ["worker", "dispatcher", "delivery", "supervisor"];

function isDateKey(v: unknown): v is string {
  return typeof v === "string" && businessDayRangeUtc(v) !== null;
}

function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Oraliq kalendar oyimi: "2026-11" yoki null. Joriy oyda bugungacha ham oy. */
export function monthOfRange(from: string, to: string, today: string): string | null {
  if (!from.endsWith("-01") || from.slice(0, 7) !== to.slice(0, 7)) return null;
  const ym = from.slice(0, 7);
  if (to === lastDayOfMonth(ym)) return ym;
  if (to === today && today.slice(0, 7) === ym) return ym;
  return null;
}

const sortLines = (lines: Lines): WorkLine[] =>
  Object.values(lines).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

function serializeWork(w: EmployeeWork) {
  return {
    washed: sortLines(w.washed),
    packed: sortLines(w.packed),
    delivered: sortLines(w.delivered),
    returned: sortLines(w.returned),
    deliveredMoney: w.deliveredMoney,
    onsite: w.onsite,
    onsiteTeam: w.onsiteTeam,
    created: { ...w.created, orderNumbers: [...w.created.orderNumbers].sort((a, b) => a - b), items: sortLines(w.created.items) },
    pickedUp: { ...w.pickedUp, orderNumbers: [...w.pickedUp.orderNumbers].sort((a, b) => a - b) },
  };
}

workRouter.post("/adminWorkPeriod", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const today = businessDateString(new Date());
    const from = req.body?.from ?? today;
    const to = req.body?.to ?? from;
    if (!isDateKey(from) || !isDateKey(to)) throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
    if (from > to) throw new ApiError(400, "invalid-argument", "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas");
    if (to > today) throw new ApiError(400, "invalid-argument", "Kelajakdagi kunni tanlab bo'lmaydi");
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    if (days > MAX_RANGE_DAYS) throw new ApiError(400, "invalid-argument", `Oraliq ${MAX_RANGE_DAYS} kundan oshmasin`);

    const month = monthOfRange(from, to, today);
    const force = req.body?.force === true;

    const [employeesSnap, period, advancesByEmployee, existingRuns] = await Promise.all([
      db.collection("employees").get(),
      loadPeriodWork(from, to, { force }),
      month ? loadAdvances(month) : Promise.resolve(new Map<string, number>()),
      month ? db.collectionGroup("payrollRuns").where("yearMonth", "==", month).get() : Promise.resolve(null),
    ]);

    const rangeStart = businessDayRangeUtc(from)!.start;
    const rangeEnd = businessDayRangeUtc(to)!.end;

    const employees = [];
    const runWrites: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> | null }[] = [];
    const existing = new Map<string, Record<string, unknown>>();
    for (const d of existingRuns?.docs ?? []) existing.set(d.ref.parent.parent?.id ?? "", d.data());

    for (const doc of employeesSnap.docs) {
      const e = doc.data();
      const work = period.get(doc.id) ?? emptyWork();
      const hiredAt = (e.createdAt as Timestamp | undefined)?.toDate();
      const terminatedAt = (e.terminatedAt as Timestamp | undefined)?.toDate();
      const activeInRange = (!hiredAt || hiredAt < rangeEnd) && (!terminatedAt || terminatedAt >= rangeStart);
      // Faol xodimlar har doim; bo'shatilgani — faqat shu davrda ishlagan bo'lsa.
      if (!(e.status === "active" || (activeInRange && hasWork(work)))) continue;

      const salary = e.salary && typeof e.salary === "object" && typeof (e.salary as SalaryConfig).method === "string"
        ? { method: (e.salary as SalaryConfig).method, params: ((e.salary as SalaryConfig).params ?? {}) as Record<string, number> }
        : null;
      const pay: PayResult | null = computePay(salary, work, { month: !!month, advances: advancesByEmployee.get(doc.id) ?? 0 });

      employees.push({
        id: doc.id,
        fullName: (e.fullName as string) ?? "Noma'lum",
        phone: (e.phone as string) ?? "",
        department: (e.department as string) ?? "",
        status: (e.status as string) ?? "active",
        specializations: Array.isArray(e.specializations) ? e.specializations : [],
        canPack: e.canPack === true,
        salary,
        work: serializeWork(work),
        pay,
      });

      // Oylik maosh yozuvi — faqat o'zgarganda.
      if (month) {
        const ref = doc.ref.collection("payrollRuns").doc(month);
        const prev = existing.get(doc.id);
        if (pay && activeInRange) {
          const next = {
            yearMonth: month,
            method: pay.method,
            amount: pay.total,
            breakdown: { grossAmount: pay.variable + pay.base, variable: pay.variable, baseAmount: pay.base, advancesTotal: pay.advances },
          };
          if (!prev || prev.amount !== next.amount || prev.method !== next.method) runWrites.push({ ref, data: next });
        } else if (prev) {
          runWrites.push({ ref, data: null });
        }
      }
    }

    employees.sort((a, b) => {
      const da = DEPARTMENT_ORDER.indexOf(a.department);
      const dbi = DEPARTMENT_ORDER.indexOf(b.department);
      return (da < 0 ? 99 : da) - (dbi < 0 ? 99 : dbi) || a.fullName.localeCompare(b.fullName);
    });

    if (runWrites.length > 0) {
      const batch = db.batch();
      for (const w of runWrites) {
        if (w.data) batch.set(w.ref, { ...w.data, computedAt: FieldValue.serverTimestamp() });
        else batch.delete(w.ref);
      }
      await batch.commit().catch((err) => console.error("payrollRuns yozib bo'lmadi:", err));
    }

    // Statistika: mahsulot × tarif × birlik bo'yicha — yuvildi / qadoqlandi / topshirildi / qayta yuvish.
    const products = new Map<string, { name: string; tariff: string; unit: string; washed: WorkLine | null; packed: WorkLine | null; delivered: WorkLine | null; returned: WorkLine | null }>();
    const stages = ["washed", "packed", "delivered", "returned"] as const;
    const stageTotals: Record<(typeof stages)[number], Lines> = { washed: {}, packed: {}, delivered: {}, returned: {} };
    for (const w of period.values()) {
      for (const stage of stages) for (const line of Object.values(w[stage])) addLine(stageTotals[stage], line);
    }
    for (const stage of stages) {
      for (const [key, line] of Object.entries(stageTotals[stage])) {
        const row = products.get(key) ?? { name: line.name, tariff: line.tariff, unit: line.unit, washed: null, packed: null, delivered: null, returned: null };
        row[stage] = line;
        products.set(key, row);
      }
    }

    res.json({
      from,
      to,
      days,
      month,
      generatedAt: new Date().toISOString(),
      employees,
      products: [...products.values()].sort(
        (a, b) => (b.washed?.amount ?? 0) - (a.washed?.amount ?? 0) || a.name.localeCompare(b.name),
      ),
    });
  } catch (err) {
    sendError(res, err);
  }
});

/** Shu oy uchun berilgan avanslar — xodim bo'yicha (bitta collection-group so'rov). */
async function loadAdvances(yearMonth: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const snap = await db.collectionGroup("advances").where("yearMonth", "==", yearMonth).get();
    for (const d of snap.docs) {
      const employeeId = d.ref.parent.parent?.id;
      if (!employeeId) continue;
      map.set(employeeId, (map.get(employeeId) ?? 0) + ((d.data().amount as number) || 0));
    }
  } catch (err) {
    // Collection-group indeksi hali yaratilmagan bo'lsa — xodim bo'yicha.
    console.error("Avanslarni collection-group bilan o'qib bo'lmadi, alohida o'qiladi:", err);
    const employees = await db.collection("employees").get();
    await Promise.all(
      employees.docs.map(async (e) => {
        const s = await e.ref.collection("advances").where("yearMonth", "==", yearMonth).get();
        const total = s.docs.reduce((sum, d) => sum + ((d.data().amount as number) || 0), 0);
        if (total) map.set(e.id, total);
      }),
    );
  }
  return map;
}

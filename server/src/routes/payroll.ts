import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { businessDateString } from "../lib/businessTime";
import { computePay } from "../lib/salaryCalc";
import { loadProductRates } from "../lib/productRates";
import { emptyWork, loadPeriodWork } from "../lib/workSummary";

export const payrollRouter = Router();

/**
 * Admin xodimga oylik maoshining bir qismini "avans" sifatida oldindan
 * beradi — `computeMonthlyPayroll` shu oy uchun hisoblangan maoshdan
 * avanslar yig'indisini avtomatik ayirib, sof (net) summani chiqaradi
 * (talab: "qanchadir qismini avans sifatida berish va qolgan qismini
 * shunga qarab hisoblab borish").
 */
payrollRouter.post("/adminGiveAdvance", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { employeeId, amount, yearMonth, note } = req.body ?? {};
    if (!employeeId) {
      throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    }
    if (typeof amount !== "number" || !(amount > 0)) {
      throw new ApiError(400, "invalid-argument", "Summa musbat son bo'lishi kerak");
    }
    if (!/^\d{4}-\d{2}$/.test(yearMonth ?? "")) {
      throw new ApiError(400, "invalid-argument", "yearMonth 'YYYY-MM' formatida bo'lishi kerak");
    }

    const employeeRef = db.collection("employees").doc(employeeId);
    const snap = await employeeRef.get();
    if (!snap.exists) {
      throw new ApiError(404, "not-found", "Xodim topilmadi");
    }

    const ref = employeeRef.collection("advances").doc();
    await ref.set({
      amount,
      yearMonth,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: req.auth!.employeeId ?? req.auth!.uid,
    });

    res.json({ advanceId: ref.id });
  } catch (err) {
    sendError(res, err);
  }
});

payrollRouter.post("/adminDeleteAdvance", withAuth, requireAdmin, async (req, res) => {
  try {
    const { employeeId, advanceId } = req.body ?? {};
    if (!employeeId || !advanceId) {
      throw new ApiError(400, "invalid-argument", "employeeId va advanceId majburiy");
    }

    const ref = db.collection("employees").doc(employeeId).collection("advances").doc(advanceId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new ApiError(404, "not-found", "Avans topilmadi");
    }

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Admin har bir xodim uchun maosh usulini va parametrlarini tanlaydi
 * (talab #13). `params` shakli usulga qarab farqlanadi:
 *   fixed:                    { fixedAmount }
 *   fixed_percent:            { baseAmount, percent }
 *   delivery:                 { baseAmount, percentOfOrderValue, percentOfCashCollected }
 *   finishing (ishbay):       {}  — narxlar mahsulotda (Mahsulotlar bo'limi)
 *   washing (fiksa + ishbay): { baseAmount } — ishbay narxlari mahsulotda
 *   furniture_onsite_percent: { percent }
 */
const SALARY_METHOD_KEYS = ["fixed", "fixed_percent", "delivery", "finishing", "washing", "furniture_onsite_percent"];

payrollRouter.post("/adminSetEmployeeSalary", withAuth, requireAdmin, async (req, res) => {
  try {
    const { employeeId, method, params } = req.body ?? {};
    if (!employeeId || !method) {
      throw new ApiError(400, "invalid-argument", "employeeId va method talab qilinadi");
    }

    if (!SALARY_METHOD_KEYS.includes(method)) throw new ApiError(400, "invalid-argument", "Maosh usuli noto'g'ri");
    const clean: Record<string, number> = {};
    for (const [key, value] of Object.entries((params ?? {}) as Record<string, unknown>)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new ApiError(400, "invalid-argument", `"${key}" qiymati manfiy bo'lmagan son bo'lishi kerak`);
      }
      clean[key] = value;
    }

    const ref = db.collection("employees").doc(employeeId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Xodim topilmadi");

    await ref.update({ salary: { method, params: clean } });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Bir martalik, idempotent migratsiya — `doneAt` maydoni qo'shilishidan
 * OLDIN "done"ga o'tgan onsite buyurtmalarda bu maydon yo'q, shuning
 * uchun ular endi oylik maosh hisobida umuman ko'rinmay qolardi. Eng
 * yaqin taxmin sifatida `updatedAt`ni ishlatib to'ldiradi (aniq emas,
 * lekin butunlay yo'qolib ketishidan yaxshiroq). Faqat `doneAt`i yo'q
 * yozuvlarga tegadi — allaqachon to'g'ri maydonga ega buyurtmalar
 * o'zgarmaydi. Admin panel ochilganda chaqiriladi (order-sources
 * bilan bir xil "ensure" naqshi).
 */
payrollRouter.post("/adminBackfillDoneAt", withAuth, requireAdmin, async (_req, res) => {
  try {
    const snap = await db.collection("orders").where("serviceType", "==", "onsite").where("status", "==", "done").get();
    const missing = snap.docs.filter((d) => !d.data().doneAt);
    if (missing.length > 0) {
      const batch = db.batch();
      for (const doc of missing) {
        const data = doc.data();
        const fallback = data.updatedAt ?? data.createdAt ?? FieldValue.serverTimestamp();
        batch.update(doc.ref, { doneAt: fallback });
      }
      await batch.commit();
    }
    res.json({ ok: true, backfilled: missing.length });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Oy uchun maosh — endi "Maosh va statistika" sahifasi /adminWorkPeriod
 * orqali avtomatik hisoblaydi. Bu yo'l eski mijozlar uchun qoldirildi va
 * xuddi o'sha dvigateldan foydalanadi (lib/workSummary.ts, lib/salaryCalc.ts):
 * oy chegaralari Toshkent vaqti bo'yicha, barcha birliklar hisobga olinadi,
 * baza bir marta o'qiladi.
 */
payrollRouter.post("/computeMonthlyPayroll", withAuth, requireAdmin, async (req, res) => {
  try {
    const { yearMonth } = req.body ?? {};
    if (!/^\d{4}-\d{2}$/.test(yearMonth ?? "")) {
      throw new ApiError(400, "invalid-argument", "yearMonth 'YYYY-MM' formatida bo'lishi kerak");
    }
    const [y, m] = yearMonth.split("-").map(Number);
    const from = `${yearMonth}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const today = businessDateString(new Date());
    if (from > today) throw new ApiError(400, "invalid-argument", "Kelajakdagi oyni hisoblab bo'lmaydi");
    const to = lastDay < today ? lastDay : today;

    const [employeesSnap, period, rates] = await Promise.all([db.collection("employees").get(), loadPeriodWork(from, to), loadProductRates()]);
    const results: Record<string, { fullName: string; department: string; method: string; amount: number; breakdown: Record<string, unknown> }> = {};
    for (const doc of employeesSnap.docs) {
      const e = doc.data();
      const salary = e.salary as { method?: string; params?: Record<string, number> } | undefined;
      if (!salary?.method || e.status !== "active") continue;
      const advancesSnap = await doc.ref.collection("advances").where("yearMonth", "==", yearMonth).get();
      const advances = advancesSnap.docs.reduce((sum, d) => sum + ((d.data().amount as number) || 0), 0);
      const pay = computePay({ method: salary.method, params: salary.params ?? {} }, period.get(doc.id) ?? emptyWork(), { month: true, advances, rates });
      if (!pay) continue;
      const breakdown = { grossAmount: pay.variable + pay.base, variable: pay.variable, baseAmount: pay.base, advancesTotal: pay.advances };
      await doc.ref.collection("payrollRuns").doc(yearMonth).set({
        yearMonth,
        method: pay.method,
        amount: pay.total,
        breakdown,
        computedAt: FieldValue.serverTimestamp(),
      });
      results[doc.id] = { fullName: e.fullName as string, department: e.department as string, method: pay.method, amount: pay.total, breakdown };
    }
    res.json({ yearMonth, results });
  } catch (err) {
    sendError(res, err);
  }
});

import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

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
 *   finishing (pardozlash):   { pricePerSqm }
 *   washing:                  { baseAmount, pricePerSqm }
 *   furniture_onsite_percent: { percent }
 */
payrollRouter.post("/adminSetEmployeeSalary", withAuth, requireAdmin, async (req, res) => {
  try {
    const { employeeId, method, params } = req.body ?? {};
    if (!employeeId || !method) {
      throw new ApiError(400, "invalid-argument", "employeeId va method talab qilinadi");
    }

    const ref = db.collection("employees").doc(employeeId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Xodim topilmadi");

    await ref.update({ salary: { method, params: params ?? {} } });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

function monthRange(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

interface OrderRow {
  id: string;
  createdBy?: string;
  washedBy?: string;
  deliveredBy?: string;
  assignedTeam?: string[];
  serviceType?: string;
  status?: string;
  totalPrice?: number;
  totalArea?: number;
  collectedAmount?: number;
}

/**
 * Berilgan oy uchun har bir faol xodimning maoshini o'zining tanlangan
 * usuli bo'yicha hisoblaydi va `employees/{id}/payrollRuns/{yyyy-MM}`ga
 * yozadi (shaffoflik uchun breakdown bilan birga). Admin istalgan vaqt
 * "Qayta hisoblash" orqali qayta chaqira oladi.
 */
payrollRouter.post("/computeMonthlyPayroll", withAuth, requireAdmin, async (req, res) => {
  try {
    const { yearMonth } = req.body ?? {};
    if (!/^\d{4}-\d{2}$/.test(yearMonth ?? "")) {
      throw new ApiError(400, "invalid-argument", "yearMonth 'YYYY-MM' formatida bo'lishi kerak");
    }
    const { start, end } = monthRange(yearMonth);

    // Diqqat: barcha xodimlar olinadi (faqat hozir "active" bo'lganlar emas) —
    // maosh shu OY DAVOMIDA faol bo'lgan xodimlarga hisoblanishi kerak, hozirgi
    // holatiga qarab emas. Aks holda o'tgan oyni qayta hisoblaganda, keyinroq
    // ishdan bo'shatilgan xodim o'sha oyda haqiqatan ishlagan bo'lsa ham
    // ro'yxatdan butunlay tushib qolar edi.
    const [employeesSnap, updatedSnap, createdSnap] = await Promise.all([
      db.collection("employees").get(),
      db.collection("orders").where("updatedAt", ">=", start).where("updatedAt", "<", end).get(),
      db.collection("orders").where("createdAt", ">=", start).where("createdAt", "<", end).get(),
    ]);

    const updatedOrders = updatedSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrderRow);
    const createdOrders = createdSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrderRow);

    const results: Record<
      string,
      { fullName: string; department: string; method: string; amount: number; breakdown: Record<string, unknown> }
    > = {};

    for (const empDoc of employeesSnap.docs) {
      const emp = empDoc.data();
      const empId = empDoc.id;
      const payrollRunRef = db.collection("employees").doc(empId).collection("payrollRuns").doc(yearMonth);

      // Xodim shu oy davomida faol bo'lgan bo'lishi kerak: oy tugashidan oldin
      // ishga qabul qilingan, va (agar bo'shatilgan bo'lsa) oy boshlanishidan
      // KEYIN bo'shatilgan bo'lishi kerak. Eskirgan (masalan, ishga
      // qabul qilinishidan oldingi oy uchun avvalroq xato hisoblangan)
      // yozuv qolib ketmasligi uchun bunday holatlarda tozalab qo'yiladi —
      // "Hisoblash" har doim shu oyning haqiqiy holatini aks ettirishi kerak.
      const salary = emp.salary as { method?: string; params?: Record<string, number> } | undefined;
      const hiredAt = (emp.createdAt as Timestamp | undefined)?.toDate();
      const terminatedAt = (emp.terminatedAt as Timestamp | undefined)?.toDate();
      const wasActiveDuringMonth = (!hiredAt || hiredAt < end) && (!terminatedAt || terminatedAt >= start);

      if (!salary?.method || !wasActiveDuringMonth) {
        await payrollRunRef.delete();
        continue;
      }
      const params = salary.params ?? {};
      let amount = 0;
      let breakdown: Record<string, unknown> = {};

      switch (salary.method) {
        case "fixed": {
          amount = params.fixedAmount ?? 0;
          breakdown = { fixedAmount: amount };
          break;
        }
        case "fixed_percent": {
          const attributed = createdOrders.filter((o) => o.createdBy === empId);
          const revenue = attributed.reduce((s, o) => s + (o.totalPrice || 0), 0);
          const base = params.baseAmount ?? 0;
          const percent = params.percent ?? 0;
          amount = base + (revenue * percent) / 100;
          breakdown = { baseAmount: base, percent, attributedRevenue: revenue, orderCount: attributed.length };
          break;
        }
        case "delivery": {
          const delivered = updatedOrders.filter((o) => o.deliveredBy === empId && o.status === "done");
          const orderValue = delivered.reduce((s, o) => s + (o.totalPrice || 0), 0);
          const collected = delivered.reduce((s, o) => s + (o.collectedAmount || 0), 0);
          const base = params.baseAmount ?? 0;
          amount =
            base + (orderValue * (params.percentOfOrderValue ?? 0)) / 100 + (collected * (params.percentOfCashCollected ?? 0)) / 100;
          breakdown = { baseAmount: base, orderValue, collected, orderCount: delivered.length };
          break;
        }
        case "finishing": {
          const washed = updatedOrders.filter((o) => o.washedBy === empId);
          const area = washed.reduce((s, o) => s + (o.totalArea || 0), 0);
          const rate = params.pricePerSqm ?? 0;
          amount = area * rate;
          breakdown = { area, pricePerSqm: rate, orderCount: washed.length };
          break;
        }
        case "washing": {
          const washed = updatedOrders.filter((o) => o.washedBy === empId);
          const area = washed.reduce((s, o) => s + (o.totalArea || 0), 0);
          const base = params.baseAmount ?? 0;
          const rate = params.pricePerSqm ?? 0;
          amount = base + area * rate;
          breakdown = { baseAmount: base, area, pricePerSqm: rate, orderCount: washed.length };
          break;
        }
        case "furniture_onsite_percent": {
          const onsiteDone = updatedOrders.filter(
            (o) => o.serviceType === "onsite" && o.status === "done" && (o.assignedTeam ?? []).includes(empId),
          );
          const revenue = onsiteDone.reduce((s, o) => s + (o.totalPrice || 0), 0);
          const percent = params.percent ?? 0;
          amount = (revenue * percent) / 100;
          breakdown = { revenue, percent, orderCount: onsiteDone.length };
          break;
        }
        default:
          continue;
      }

      // Shu oy uchun berilgan avanslar hisoblangan (gross) maoshdan
      // ayiriladi — natija sof (net) to'lanadigan summa. Ataylab NOLGA
      // cheklanmaydi: agar avans hisoblangan maoshdan katta bo'lsa, admin
      // buni ochiq-oydin (manfiy summa sifatida) ko'rishi kerak — bu
      // xodim "qarzga chiqib qolgani"ni bildiradi.
      const advancesSnap = await db
        .collection("employees")
        .doc(empId)
        .collection("advances")
        .where("yearMonth", "==", yearMonth)
        .get();
      const advancesTotal = advancesSnap.docs.reduce((s, d) => s + ((d.data().amount as number) || 0), 0);
      const grossAmount = amount;
      const netAmount = grossAmount - advancesTotal;
      amount = netAmount;
      breakdown = { ...breakdown, grossAmount, advancesTotal };

      await payrollRunRef.set({
        yearMonth, // qidiruv uchun maydon sifatida ham — "Oylik hisobot" bir
        // yilning barcha xodimlar maoshini bitta collection-group so'rovda
        // olishi uchun kerak (hujjat ID'sining o'zi bo'yicha collection-group
        // so'rov qilib bo'lmaydi).
        method: salary.method,
        amount,
        breakdown,
        computedAt: FieldValue.serverTimestamp(),
      });

      results[empId] = {
        fullName: emp.fullName,
        department: emp.department,
        method: salary.method,
        amount,
        breakdown,
      };
    }

    res.json({ yearMonth, results });
  } catch (err) {
    sendError(res, err);
  }
});

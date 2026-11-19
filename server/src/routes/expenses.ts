import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, requireEmployeeFlag, type AuthedRequest } from "../lib/authz";
import { businessDateString } from "../lib/businessTime";
import { isValidActionId } from "../lib/idempotency";

export const expensesRouter = Router();

/**
 * Maosh bilan bog'liq bo'lmagan chiqimlar — ijaraq, kommunal, jihoz va h.k.
 * Bir martalik (aniq sanaga tegishli) yoki oyma-oy takrorlanuvchi (masalan
 * ijaraq — har oy shu sanadan boshlab hisoblanadi) bo'lishi mumkin.
 * O'qish to'g'ridan-to'g'ri Firestore orqali (faqat admin — firestore.rules),
 * yozish shu yerdan, boshqa yozuvlar bilan bir xil izchillikda.
 */
function validateExpenseBody(body: Record<string, unknown>): { name: string; amount: number; date: Date; recurring: boolean } {
  const { name, amount, date, recurring } = body;
  if (!(name as string)?.toString()?.trim()) {
    throw new ApiError(400, "invalid-argument", "Chiqim nomi majburiy");
  }
  if (typeof amount !== "number" || amount <= 0) {
    throw new ApiError(400, "invalid-argument", "Summa musbat son bo'lishi kerak");
  }
  const parsedDate = new Date(date as string);
  if (isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "invalid-argument", "Sana noto'g'ri");
  }
  return { name: (name as string).trim(), amount, date: parsedDate, recurring: !!recurring };
}

expensesRouter.post("/adminCreateExpense", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { name, amount, date, recurring } = validateExpenseBody(req.body ?? {});

    const ref = db.collection("expenses").doc();
    await ref.set({
      name,
      amount,
      date: Timestamp.fromDate(date),
      recurring,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: req.auth!.uid,
    });

    res.json({ expenseId: ref.id });
  } catch (err) {
    sendError(res, err);
  }
});

expensesRouter.post("/adminUpdateExpense", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { expenseId, fromCash } = req.body ?? {};
    if (!expenseId) throw new ApiError(400, "invalid-argument", "expenseId majburiy");
    const { name, amount, date, recurring } = validateExpenseBody(req.body ?? {});

    const ref = db.collection("expenses").doc(expenseId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Chiqim topilmadi");
    // Xodim kiritgan chiqim kun kaliti bo'yicha kassa hisobiga tushadi —
    // sana o'zgarsa kalit ham u bilan birga ko'chishi shart.
    const byEmployee = typeof snap.data()?.employeeId === "string";

    await ref.update({
      name,
      amount,
      date: Timestamp.fromDate(date),
      recurring,
      ...(byEmployee ? { dateKey: businessDateString(date) } : {}),
      ...(byEmployee && typeof fromCash === "boolean" ? { fromCash } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

expensesRouter.post("/adminDeleteExpense", withAuth, requireAdmin, async (req, res) => {
  try {
    const { expenseId } = req.body ?? {};
    if (!expenseId) throw new ApiError(400, "invalid-argument", "expenseId majburiy");

    const ref = db.collection("expenses").doc(expenseId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Chiqim topilmadi");

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

const MAX_EMPLOYEE_EXPENSE = 50_000_000;

/**
 * Xodim ilovadan chiqim kiritadi (yoqilg'i, texnik xizmat, ...) — admin
 * panelda "Chiqim qo'shish" vakolati (`canAddExpenses`) berilgan bo'lsa.
 *
 * Sana — server vaqti (xodim o'tgan kunga yoza olmaydi). `fromCash` —
 * pul xodim qo'lidagi naqddan berilgan: o'sha kuni u kassaga
 * topshiradigan naqd shu summaga kamayadi (routes/dailyReport.ts).
 *
 * Ilova oflayn yozganda ID'ni o'zi beradi (`expenseId`) — takroriy
 * yuborish ikkinchi chiqim yaratmaydi.
 */
expensesRouter.post("/addExpense", withAuth, async (req: AuthedRequest, res) => {
  try {
    await requireEmployeeFlag(req, "canAddExpenses", "Chiqim qo'shish huquqingiz yo'q");
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { expenseId, name, amount, note, fromCash } = req.body ?? {};

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName || cleanName.length > 80) {
      throw new ApiError(400, "invalid-argument", "Chiqim nomi 1–80 belgi bo'lishi kerak");
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > MAX_EMPLOYEE_EXPENSE) {
      throw new ApiError(400, "invalid-argument", "Summa noto'g'ri");
    }
    const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null;
    if (expenseId !== undefined && !isValidActionId(expenseId)) {
      throw new ApiError(400, "invalid-argument", "expenseId noto'g'ri");
    }

    const ref = expenseId ? db.collection("expenses").doc(expenseId) : db.collection("expenses").doc();
    const now = new Date();
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        if (existing.data()?.employeeId !== employeeId) {
          throw new ApiError(409, "already-exists", "Bu ID band");
        }
        return; // Takroriy yuborish — allaqachon saqlangan.
      }
      tx.set(ref, {
        name: cleanName,
        amount: Math.round(amount),
        note: cleanNote,
        date: Timestamp.fromDate(now),
        dateKey: businessDateString(now),
        recurring: false,
        fromCash: fromCash === true,
        employeeId,
        createdBy: req.auth!.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    res.json({ expenseId: ref.id });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xodim o'z chiqimini o'chiradi — xato kiritilganini tuzatish uchun.
 * Faqat SHU KUNI va kunlik naqd hali kassaga topshirilmagan bo'lsa:
 * topshirilgan summa o'zgarib qolmasligi kerak. Keyinroq faqat admin.
 */
expensesRouter.post("/deleteMyExpense", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { expenseId } = req.body ?? {};
    if (typeof expenseId !== "string" || !expenseId) throw new ApiError(400, "invalid-argument", "expenseId majburiy");

    const ref = db.collection("expenses").doc(expenseId);
    const snap = await ref.get();
    if (!snap.exists) {
      // Allaqachon o'chirilgan (masalan takroriy yuborish) — maqsadga erishilgan.
      res.json({ ok: true });
      return;
    }
    const data = snap.data()!;
    if (data.employeeId !== employeeId) throw new ApiError(403, "permission-denied", "Faqat o'z chiqimingizni o'chira olasiz");

    const today = businessDateString(new Date());
    if (data.dateKey !== today) {
      throw new ApiError(400, "failed-precondition", "Faqat bugungi chiqimni o'chirish mumkin — adminga murojaat qiling");
    }
    const handover = await db.collection("cashHandovers").doc(today).get();
    if (data.fromCash === true && handover.data()?.handedOver?.[employeeId] !== undefined) {
      throw new ApiError(400, "failed-precondition", "Bugungi naqd allaqachon topshirilgan — adminga murojaat qiling");
    }

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

const MAX_MY_EXPENSE_DAYS = 92;

/**
 * Xodimning o'z chiqimlari tanlangan davrda (oy yoki istalgan oraliq) —
 * ilovadagi "Chiqimlar" sahifasi kalendar va diagramma uchun. Davr kunlari
 * (`dateKey`) bo'yicha bitta so'rov; boshqa xodimlarniki serverda tashlanadi
 * (davrdagi chiqimlar soni kam, qo'shimcha indeks shart emas).
 */
expensesRouter.post("/myExpenses", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const today = businessDateString(new Date());
    const from = typeof req.body?.from === "string" ? req.body.from : today;
    const to = typeof req.body?.to === "string" ? req.body.to : from;
    const isKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
    if (!isKey(from) || !isKey(to) || from > to) throw new ApiError(400, "invalid-argument", "Sana oralig'i noto'g'ri");
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    if (days > MAX_MY_EXPENSE_DAYS) throw new ApiError(400, "invalid-argument", `Oraliq ${MAX_MY_EXPENSE_DAYS} kundan oshmasin`);

    const docs = await loadOwnExpenses(employeeId, from, to);
    const expenses = docs
      .map((d) => {
        const e = d.data();
        return {
          id: d.id,
          name: (e.name as string | undefined) ?? "Chiqim",
          amount: (e.amount as number | undefined) ?? 0,
          note: (e.note as string | null | undefined) ?? null,
          fromCash: e.fromCash === true,
          dateKey: (e.dateKey as string | undefined) ?? null,
          at: e.date instanceof Timestamp ? e.date.toDate().toISOString() : null,
        };
      })
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    res.json({ from, to, expenses });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xodimning o'z chiqimlari davrda. Asosiy yo'l — (employeeId, dateKey)
 * indeksi: faqat o'z hujjatlari o'qiladi. Indeks hali joylanmagan bo'lsa
 * (FAILED_PRECONDITION) — davrdagi hamma chiqim o'qilib, filtrlanadi.
 */
async function loadOwnExpenses(employeeId: string, from: string, to: string) {
  try {
    const snap = await db
      .collection("expenses")
      .where("employeeId", "==", employeeId)
      .where("dateKey", ">=", from)
      .where("dateKey", "<=", to)
      .get();
    return snap.docs;
  } catch (err) {
    if ((err as { code?: number }).code !== 9) throw err;
    console.warn("myExpenses: (employeeId, dateKey) indeksi yo'q — zaxira so'rov");
    const snap = await db.collection("expenses").where("dateKey", ">=", from).where("dateKey", "<=", to).get();
    return snap.docs.filter((d) => d.data().employeeId === employeeId);
  }
}

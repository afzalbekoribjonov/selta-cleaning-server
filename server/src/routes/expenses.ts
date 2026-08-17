import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

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
    const { expenseId } = req.body ?? {};
    if (!expenseId) throw new ApiError(400, "invalid-argument", "expenseId majburiy");
    const { name, amount, date, recurring } = validateExpenseBody(req.body ?? {});

    const ref = db.collection("expenses").doc(expenseId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Chiqim topilmadi");

    await ref.update({
      name,
      amount,
      date: Timestamp.fromDate(date),
      recurring,
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

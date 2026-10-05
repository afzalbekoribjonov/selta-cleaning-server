import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, requireEmployeeFlag, type AuthedRequest } from "../lib/authz";
import { businessDayRangeUtc, parseDateKey } from "../lib/businessTime";
import { dailyActivityEvents } from "../lib/dailyActivity";
import { buildDailyReceipt } from "../lib/dailyReceipt";
import { cashExpensesByEmployee, loadEmployeeExpenses } from "../lib/expenses";
import { loadEmployeeNames } from "../lib/employeeNames";
import { DEFAULT_RECEIPT_SETTINGS, validateReceiptSettings } from "../lib/receiptSettings";

export const receiptRouter = Router();

/** Chek ko'rinishini saqlash (admin panel → Sozlamalar → "Chek"). */
receiptRouter.post("/adminUpdateReceiptSettings", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const result = validateReceiptSettings(req.body?.settings);
    if (typeof result === "string") throw new ApiError(400, "invalid-argument", result);
    await db
      .collection("settings")
      .doc("receipt")
      .set({ ...result, updatedBy: req.auth!.employeeId ?? req.auth!.uid, updatedAt: new Date() });
    res.json({ ok: true, settings: result });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * "Kunlik hisobot cheki" — admin yoki `canPrintDailyReport` vakolatli
 * xodim. Hamma raqam shu so'rovda bazadan hisoblanadi (lib/dailyReceipt.ts)
 * va chekning tayyor bloklari qaytariladi.
 */
receiptRouter.post("/dailyReceiptReport", withAuth, async (req: AuthedRequest, res) => {
  try {
    await requireEmployeeFlag(req, "canPrintDailyReport", "Kunlik hisobot chekini ko'rish huquqingiz yo'q");
    const dateKey = parseDateKey(req.body?.date);
    if (!dateKey) throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
    const range = businessDayRangeUtc(dateKey)!;
    const start = Timestamp.fromDate(range.start);
    const end = Timestamp.fromDate(range.end);

    const [eventsSnap, createdSnap, pickedSnap, expenses, handoverSnap, names, settingsSnap] = await Promise.all([
      dailyActivityEvents(dateKey).get(),
      db.collection("orders").where("createdAt", ">=", start).where("createdAt", "<", end).get(),
      db.collection("orders").where("pickedUpAt", ">=", start).where("pickedUpAt", "<", end).get(),
      loadEmployeeExpenses(dateKey),
      db.collection("cashHandovers").doc(dateKey).get(),
      loadEmployeeNames(),
      db.collection("settings").doc("receipt").get(),
    ]);

    const settings = validateReceiptSettings(settingsSnap.data() ?? {});
    const report = buildDailyReceipt({
      dateKey,
      generatedAt: new Date(),
      names,
      events: eventsSnap.docs.map((d) => d.data()),
      createdOrders: createdSnap.docs.map((d) => ({
        createdBy: (d.data().createdBy as string) ?? "",
        totalPrice: (d.data().totalPrice as number | undefined) ?? 0,
      })),
      pickedUpOrders: pickedSnap.docs.map((d) => ({ pickedUpBy: (d.data().pickedUpBy as string) ?? "" })),
      cashExpenses: cashExpensesByEmployee(expenses),
      handedOver: new Set(Object.keys((handoverSnap.data()?.handedOver as Record<string, unknown> | undefined) ?? {})),
      settings: typeof settings === "string" ? DEFAULT_RECEIPT_SETTINGS : settings,
    });
    res.json(report);
  } catch (err) {
    sendError(res, err);
  }
});

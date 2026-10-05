import { Router } from "express";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { validateReceiptSettings } from "../lib/receiptSettings";

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

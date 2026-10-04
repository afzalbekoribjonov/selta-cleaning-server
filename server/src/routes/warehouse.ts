import { Router } from "express";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const warehouseRouter = Router();

/**
 * Omborxona qoidasi: barcha mahsulotlari tayyor bo'lib, muddatidan shuncha
 * kundan ko'p o'tgan buyurtma omborga tushadi.
 *
 * Qoida ilovada, buyurtma xulosasidan hisoblanadi — qo'shimcha o'qish,
 * rejalashtirilgan vazifa yoki "omborga ko'chirish" yozuvi yo'q. Shuning
 * uchun bu yerda faqat chegara saqlanadi (`settings/warehouse`); ilova
 * uni jonli o'qiydi va o'zgarish darhol hamma joyda kuchga kiradi.
 */
export const DEFAULT_WAREHOUSE_DAYS = 10;

export function validateWarehouseDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 365 ? value : null;
}

warehouseRouter.post("/adminUpdateWarehouseSettings", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const thresholdDays = validateWarehouseDays(req.body?.thresholdDays);
    if (thresholdDays === null) {
      throw new ApiError(400, "invalid-argument", "Kunlar soni 1 dan 365 gacha butun son bo'lishi kerak");
    }
    await db.collection("settings").doc("warehouse").set(
      { thresholdDays, updatedBy: req.auth!.employeeId ?? req.auth!.uid, updatedAt: new Date() },
      { merge: true },
    );
    res.json({ ok: true, thresholdDays });
  } catch (err) {
    sendError(res, err);
  }
});

import { Router } from "express";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const warehouseRouter = Router();

/**
 * Omborxona qoidasi — MAHSULOT darajasida: "Tayyor" holatiga o'tganiga
 * shuncha kun bo'lgan (mijoz hali olib ketmagan) har bir mahsulot alohida
 * omborga tushadi. Buyurtmaning qolgan mahsulotlari o'z vaqtida tushadi
 * yoki umuman tushmaydi.
 *
 * Qoida ilovada, buyurtmadagi mahsulotlar nusxasidan (`itemsMirror`:
 * status + packedAt) hisoblanadi — qo'shimcha o'qish, rejalashtirilgan
 * vazifa yoki "ko'chirish" yozuvi yo'q: mahsulot topshirilishi bilan
 * ombordan o'z-o'zidan chiqadi. Bu yerda faqat chegara saqlanadi
 * (`settings/warehouse.readyDays`); ilova uni jonli o'qiydi.
 *
 * Avvalgi `thresholdDays` (butun buyurtma muddatidan necha kun kechikkani)
 * boshqa ma'noga ega edi — uning eski qiymati yangi qoidaga
 * ishlatilmasligi uchun maydon ham alohida.
 */
export const DEFAULT_WAREHOUSE_READY_DAYS = 5;

export function validateWarehouseDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 365 ? value : null;
}

warehouseRouter.post("/adminUpdateWarehouseSettings", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const readyDays = validateWarehouseDays(req.body?.readyDays);
    if (readyDays === null) {
      throw new ApiError(400, "invalid-argument", "Kunlar soni 1 dan 365 gacha butun son bo'lishi kerak");
    }
    await db.collection("settings").doc("warehouse").set(
      { readyDays, updatedBy: req.auth!.employeeId ?? req.auth!.uid, updatedAt: new Date() },
      { merge: true },
    );
    res.json({ ok: true, readyDays });
  } catch (err) {
    sendError(res, err);
  }
});

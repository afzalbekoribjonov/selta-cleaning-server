import { Router } from "express";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { loadTariffs, normalizeTariffs, saveTariffs } from "../lib/tariffs";

export const tariffsRouter = Router();

/**
 * Tarif sozlamalari — muddat va rang bosqichlari.
 *
 * O'qish admin panelda Firestore'dan to'g'ridan-to'g'ri (jonli) amalga
 * oshiriladi; bu yo'l esa server o'zi ko'rayotgan qiymatni qaytaradi va
 * keshning ishlashini tekshirishga imkon beradi.
 */
tariffsRouter.post("/adminGetTariffs", withAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  try {
    res.json({ tariffs: await loadTariffs() });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Sozlamani YAXLIT almashtiradi — barcha tariflar bir so'rovda keladi.
 *
 * Qisman yangilash ataylab yo'q: admin panelda ham to'rttasi birga
 * tahrirlanadi, yaxlit yozish esa yarim saqlanib qolgan holatni
 * butunlay yo'q qiladi.
 */
tariffsRouter.post("/adminUpdateTariffs", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const config = normalizeTariffs(req.body?.tariffs);
    if (!config) {
      throw new ApiError(
        400,
        "invalid-argument",
        "Har bir tarif uchun: muddat 1-365 kun, va 1 ≤ yashil < sariq ≤ muddat bo'lishi kerak",
      );
    }

    await saveTariffs(config, req.auth!.employeeId ?? req.auth!.uid);
    res.json({ ok: true, tariffs: config });
  } catch (err) {
    sendError(res, err);
  }
});

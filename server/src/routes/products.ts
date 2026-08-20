import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const productsRouter = Router();

const CALC_TYPES = new Set(["sqm", "meter", "kg", "count", "size"]);
const VALID_TARIFFS = new Set(["express", "comfort", "standart", "premium"]);

/**
 * Narx katalogi — admin oldindan mahsulot turlari va hisoblash usulini
 * belgilaydi (kvadrat metr/metr/kilogram/soni/kichik-katta), va qaysi
 * tarif(lar)ga tegishli ekanligini ham. Xodimlar buyurtmaga mahsulot
 * qo'shganda shu katalogdan, faqat o'sha buyurtma tarifiga mos
 * mahsulotlarni ko'radi. O'qish to'g'ridan-to'g'ri Firestore orqali
 * (firestore.rules: isSignedIn()), faqat yozish shu yerdan — admin.
 */
interface TariffPriceInput {
  unitPrice?: number;
  smallPrice?: number;
  largePrice?: number;
}

/**
 * Har bir tanlangan tarif — to'liq alohida narx tuzilmasiga ega (talab:
 * "Har tarif — to'liq alohida narx"). `pricesByTariff` faqat `tariffs`
 * ro'yxatidagi kalitlarni saqlaydi — chekindan chiqarilgan tariflar
 * uchun eski narxlar avtomatik tashlab yuboriladi.
 */
function validateProductBody(body: Record<string, unknown>): { tariffs: string[]; pricesByTariff: Record<string, TariffPriceInput> } {
  const { name, calcType, tariffs, pricesByTariff } = body;
  if (!(name as string)?.toString()?.trim()) {
    throw new ApiError(400, "invalid-argument", "Mahsulot nomi majburiy");
  }
  if (!CALC_TYPES.has(calcType as string)) {
    throw new ApiError(400, "invalid-argument", "Hisoblash turi noto'g'ri");
  }
  if (!Array.isArray(tariffs) || tariffs.length === 0 || !tariffs.every((t) => VALID_TARIFFS.has(t))) {
    throw new ApiError(400, "invalid-argument", "Kamida bitta tarif tanlang");
  }
  if (typeof pricesByTariff !== "object" || pricesByTariff === null) {
    throw new ApiError(400, "invalid-argument", "Har bir tarif uchun narx kiritilishi shart");
  }

  const cleaned: Record<string, TariffPriceInput> = {};
  for (const t of tariffs as string[]) {
    const p = (pricesByTariff as Record<string, TariffPriceInput>)[t];
    if (calcType === "size") {
      if (typeof p?.smallPrice !== "number" || typeof p?.largePrice !== "number" || p.smallPrice < 0 || p.largePrice < 0) {
        throw new ApiError(400, "invalid-argument", "Har bir tarif uchun kichik va katta narxlar kiritilishi shart");
      }
      cleaned[t] = { smallPrice: p.smallPrice, largePrice: p.largePrice };
    } else {
      if (typeof p?.unitPrice !== "number" || p.unitPrice < 0) {
        throw new ApiError(400, "invalid-argument", "Har bir tarif uchun narx kiritilishi shart");
      }
      cleaned[t] = { unitPrice: p.unitPrice };
    }
  }

  return { tariffs: tariffs as string[], pricesByTariff: cleaned };
}

productsRouter.post("/adminCreateProduct", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { name, calcType } = req.body ?? {};
    const { tariffs, pricesByTariff } = validateProductBody(req.body ?? {});

    const ref = db.collection("products").doc();
    await ref.set({
      name: (name as string).trim(),
      calcType,
      tariffs,
      pricesByTariff,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: req.auth!.uid,
    });

    res.json({ productId: ref.id });
  } catch (err) {
    sendError(res, err);
  }
});

productsRouter.post("/adminUpdateProduct", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { productId, name, calcType } = req.body ?? {};
    if (!productId) throw new ApiError(400, "invalid-argument", "productId majburiy");
    const { tariffs, pricesByTariff } = validateProductBody(req.body ?? {});

    const ref = db.collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

    await ref.update({
      name: (name as string).trim(),
      calcType,
      tariffs,
      pricesByTariff,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

productsRouter.post("/adminDeleteProduct", withAuth, requireAdmin, async (req, res) => {
  try {
    const { productId } = req.body ?? {};
    if (!productId) throw new ApiError(400, "invalid-argument", "productId majburiy");

    const ref = db.collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Mahsulot holati bo'yicha narx ustama foizlari — global (barcha
 * mahsulotlarga bir xil qo'llanadi). Xodim item qo'shganda "Holati"ni
 * tanlasa, shu foiz narxga qo'shiladi (masalan "Juda yomon" => +50%).
 */
productsRouter.post("/adminSetConditionSurcharges", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { average, bad, veryBad } = req.body ?? {};
    for (const v of [average, bad, veryBad]) {
      if (typeof v !== "number" || v < 0 || v > 500) {
        throw new ApiError(400, "invalid-argument", "Foizlar 0-500 oralig'ida bo'lishi kerak");
      }
    }

    await db.collection("settings").doc("conditionSurcharges").set(
      {
        average,
        bad,
        veryBad,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.auth!.uid,
      },
      { merge: true },
    );

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

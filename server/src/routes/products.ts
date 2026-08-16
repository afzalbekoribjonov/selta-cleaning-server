import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const productsRouter = Router();

const CALC_TYPES = new Set(["sqm", "meter", "kg", "count", "size"]);

/**
 * Narx katalogi — admin oldindan mahsulot turlari va hisoblash usulini
 * belgilaydi (kvadrat metr/metr/kilogram/soni/kichik-katta). Xodimlar
 * buyurtmaga mahsulot qo'shganda shu katalogdan tanlaydi. O'qish
 * to'g'ridan-to'g'ri Firestore orqali (firestore.rules: isSignedIn()),
 * faqat yozish shu yerdan — admin.
 */
function validateProductBody(body: Record<string, unknown>) {
  const { name, calcType, unitPrice, smallPrice, largePrice } = body;
  if (!(name as string)?.toString()?.trim()) {
    throw new ApiError(400, "invalid-argument", "Mahsulot nomi majburiy");
  }
  if (!CALC_TYPES.has(calcType as string)) {
    throw new ApiError(400, "invalid-argument", "Hisoblash turi noto'g'ri");
  }
  if (calcType === "size") {
    if (typeof smallPrice !== "number" || typeof largePrice !== "number" || smallPrice < 0 || largePrice < 0) {
      throw new ApiError(400, "invalid-argument", "Kichik va katta narxlar kiritilishi shart");
    }
  } else {
    if (typeof unitPrice !== "number" || unitPrice < 0) {
      throw new ApiError(400, "invalid-argument", "Narx kiritilishi shart");
    }
  }
}

productsRouter.post("/adminCreateProduct", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { name, calcType, unitPrice, smallPrice, largePrice } = req.body ?? {};
    validateProductBody(req.body ?? {});

    const ref = db.collection("products").doc();
    await ref.set({
      name: (name as string).trim(),
      calcType,
      unitPrice: calcType === "size" ? null : unitPrice,
      smallPrice: calcType === "size" ? smallPrice : null,
      largePrice: calcType === "size" ? largePrice : null,
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
    const { productId, name, calcType, unitPrice, smallPrice, largePrice } = req.body ?? {};
    if (!productId) throw new ApiError(400, "invalid-argument", "productId majburiy");
    validateProductBody(req.body ?? {});

    const ref = db.collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

    await ref.update({
      name: (name as string).trim(),
      calcType,
      unitPrice: calcType === "size" ? null : unitPrice,
      smallPrice: calcType === "size" ? smallPrice : null,
      largePrice: calcType === "size" ? largePrice : null,
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

import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { invalidateProductRates, MAX_WORK_RATE } from "../lib/productRates";

export const productsRouter = Router();

// Nom o'zgarsa yoki mahsulot o'chsa — ishbay narxlari keshi (lib/productRates.ts) yangilanadi.
productsRouter.use((req, res, next) => {
  if (/^\/admin(Create|Update|Delete)Product$|^\/adminSetProductWorkRates$/.test(req.path)) {
    res.on("finish", () => {
      if (res.statusCode < 400) invalidateProductRates();
    });
  }
  next();
});

const CALC_TYPES = new Set(["sqm", "meter", "kg", "count", "size"]);
const VALID_TARIFFS = new Set(["express", "comfort", "standart", "premium"]);
/** Ishchi mutaxassisligi shu kategoriyalar bo'yicha belgilanadi (employeeAdmin.ts: adminSetEmployeeSpecializations). */
export const VALID_PRODUCT_CATEGORIES = new Set(["gilam", "parda", "boshqa"]);

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
function validateProductBody(
  body: Record<string, unknown>,
): { category: string; tariffs: string[]; pricesByTariff: Record<string, TariffPriceInput> } {
  const { name, calcType, category, tariffs, pricesByTariff } = body;
  if (!(name as string)?.toString()?.trim()) {
    throw new ApiError(400, "invalid-argument", "Mahsulot nomi majburiy");
  }
  if (!CALC_TYPES.has(calcType as string)) {
    throw new ApiError(400, "invalid-argument", "Hisoblash turi noto'g'ri");
  }
  if (!VALID_PRODUCT_CATEGORIES.has(category as string)) {
    throw new ApiError(400, "invalid-argument", "Mahsulot toifasi noto'g'ri");
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

  return { category: category as string, tariffs: tariffs as string[], pricesByTariff: cleaned };
}

productsRouter.post("/adminCreateProduct", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { name, calcType } = req.body ?? {};
    const { category, tariffs, pricesByTariff } = validateProductBody(req.body ?? {});

    const ref = db.collection("products").doc();
    await ref.set({
      name: (name as string).trim(),
      calcType,
      category,
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
    const { category, tariffs, pricesByTariff } = validateProductBody(req.body ?? {});

    const ref = db.collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

    await ref.update({
      name: (name as string).trim(),
      calcType,
      category,
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

/**
 * Ishbay narxlari — mahsulot bo'yicha, bir yo'la bir nechta mahsulot:
 * `{ rates: { [productId]: { wash, pack } } }`. Qiymat — 1 birlik
 * (mahsulot hisoblash turiga qarab m², metr, kg yoki dona) uchun so'm;
 * `null` yoki 0 — narx olib tashlanadi (ishbay hisoblanmaydi).
 */
productsRouter.post("/adminSetProductWorkRates", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const raw = req.body?.rates;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ApiError(400, "invalid-argument", "rates obyekt bo'lishi kerak");
    }
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length === 0) throw new ApiError(400, "invalid-argument", "O'zgarish yo'q");
    if (entries.length > 300) throw new ApiError(400, "invalid-argument", "Bir yo'la 300 tadan ko'p mahsulot");

    const clean = (v: unknown, label: string): number | null => {
      if (v === null || v === undefined || v === 0) return null;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_WORK_RATE) {
        throw new ApiError(400, "invalid-argument", `${label} narxi 0 dan ${MAX_WORK_RATE} gacha bo'lishi kerak`);
      }
      return Math.round(v * 100) / 100;
    };
    const updates = entries.map(([productId, value]) => {
      if (!productId || productId.includes("/")) throw new ApiError(400, "invalid-argument", "productId noto'g'ri");
      const r = (value ?? {}) as Record<string, unknown>;
      return { productId, wash: clean(r.wash, "Yuvish"), pack: clean(r.pack, "Qadoqlash") };
    });

    const refs = updates.map((u) => db.collection("products").doc(u.productId));
    const snaps = await db.getAll(...refs);
    const missing = snaps.filter((s) => !s.exists).map((s) => s.id);
    if (missing.length > 0) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

    const batch = db.batch();
    updates.forEach((u, i) => {
      batch.update(refs[i], {
        workRates: { wash: u.wash, pack: u.pack },
        workRatesUpdatedAt: FieldValue.serverTimestamp(),
        workRatesUpdatedBy: req.auth!.uid,
      });
    });
    await batch.commit();
    res.json({ ok: true, updated: updates.length });
  } catch (err) {
    sendError(res, err);
  }
});

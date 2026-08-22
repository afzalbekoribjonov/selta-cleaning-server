import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const orderSourcesRouter = Router();

/**
 * Buyurtma "Manba"si (talab: marketing statistikasi) — endi admin panel
 * orqali qo'shiladi/o'chiriladi (avval qattiq kodlangan 5 ta variant
 * edi). O'qish to'g'ridan-to'g'ri Firestore orqali (firestore.rules:
 * isSignedIn()), faqat yozish shu yerdan — admin.
 */
orderSourcesRouter.post("/adminCreateOrderSource", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { name, color } = req.body ?? {};
    if (!(name as string)?.toString()?.trim()) {
      throw new ApiError(400, "invalid-argument", "Manba nomi majburiy");
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test((color as string) ?? "")) {
      throw new ApiError(400, "invalid-argument", "Rang noto'g'ri");
    }

    const ref = db.collection("orderSources").doc();
    await ref.set({
      name: (name as string).trim(),
      color,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: req.auth!.uid,
    });

    res.json({ sourceId: ref.id });
  } catch (err) {
    sendError(res, err);
  }
});

orderSourcesRouter.post("/adminDeleteOrderSource", withAuth, requireAdmin, async (req, res) => {
  try {
    const { sourceId } = req.body ?? {};
    if (!sourceId) throw new ApiError(400, "invalid-argument", "sourceId majburiy");

    const ref = db.collection("orderSources").doc(sourceId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Manba topilmadi");

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

const DEFAULT_SOURCES: { id: string; name: string; color: string }[] = [
  { id: "instagram", name: "Instagram", color: "#C13584" },
  { id: "telegram", name: "Telegram", color: "#229ED9" },
  { id: "referral", name: "Tanish orqali", color: "#1E9E5A" },
  { id: "car_branding", name: "Mashina brandi", color: "#8C5AC3" },
  { id: "ad_banner", name: "Reklama banneri", color: "#CA8A04" },
];

/**
 * Bir martalik, idempotent boshlang'ich to'ldirish — kolleksiya bo'sh
 * bo'lsagina yozadi. Eski qattiq kodlangan 5 variant bilan bir xil
 * hujjat ID'laridan foydalanadi, shunda ilgari yaratilgan
 * buyurtmalarning `source` qiymati yangi (dinamik) ro'yxatda ham
 * tanilishda davom etadi. Admin panel ochilganda chaqiriladi — narxsiz,
 * chunki ikkinchi chaqiruvdan boshlab kolleksiya bo'sh emas.
 */
orderSourcesRouter.post("/adminEnsureDefaultOrderSources", withAuth, requireAdmin, async (_req, res) => {
  try {
    const existing = await db.collection("orderSources").limit(1).get();
    if (existing.empty) {
      const batch = db.batch();
      for (const s of DEFAULT_SOURCES) {
        batch.set(db.collection("orderSources").doc(s.id), {
          name: s.name,
          color: s.color,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

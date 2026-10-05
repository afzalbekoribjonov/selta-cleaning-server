import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const commentsRouter = Router();

/** Kartada bir qator ko'rinadi — to'liq matn ichki kartadagi izohlarda. */
const PREVIEW_LENGTH = 200;

const ACTIVE_STATUSES = [
  "new",
  "picked_up",
  "brought_in",
  "washing",
  "packing",
  "qc_review",
  "ready",
  "team_assigned",
  "in_progress",
];

/**
 * Buyurtmaning OXIRGI izohi — ro'yxat kartasida ko'rsatish uchun buyurtma
 * hujjatiga yoziladi (`lastComment`). Busiz har bir karta izohlarni
 * alohida o'qishi kerak bo'lardi — yuzlab o'qish.
 *
 * Izohning o'zini ilovalar to'g'ridan-to'g'ri Firestore'ga yozadi (oflayn
 * ham ishlaydi), keyin shu yo'lni chaqiradi. Ataylab server orqali, rules
 * orqali emas: rules qo'lda deploy qilinadi va izoh bilan bir paketda
 * yozilganda rad etilsa, izohning o'zi ham yo'qolardi.
 *
 * Tartib buzilmasligi uchun: yangi izoh faqat mavjud oxirgisidan YANGIROQ
 * bo'lsa yoziladi, tahrir esa faqat aynan o'sha izohni yangilaydi — eski
 * izohni tahrirlash kartadagi yangisini almashtirmaydi.
 */
commentsRouter.post("/setLastComment", withAuth, async (req: AuthedRequest, res) => {
  try {
    const { orderId, commentId, text, authorName, at } = req.body ?? {};
    if (typeof orderId !== "string" || !orderId || typeof commentId !== "string" || !commentId) {
      throw new ApiError(400, "invalid-argument", "orderId va commentId majburiy");
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new ApiError(400, "invalid-argument", "Izoh matni bo'sh");
    }
    const atMs = typeof at === "number" && Number.isFinite(at) ? at : null;

    const ref = db.collection("orders").doc(orderId);
    let applied = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // Buyurtma hali yaratilmagan bo'lishi mumkin (oflayn yaratilgan va
      // izoh oldinroq yetib keldi) — keyingi urinishda yoziladi.
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");

      const current = snap.data()!.lastComment as { commentId?: string; at?: Timestamp } | undefined;
      const sameComment = current?.commentId === commentId;
      const newer = atMs !== null && (!current?.at || atMs >= current.at.toMillis());
      if (!sameComment && !newer) return;

      tx.update(ref, {
        lastComment: {
          commentId,
          text: text.trim().slice(0, PREVIEW_LENGTH),
          authorName: typeof authorName === "string" ? authorName.trim().slice(0, 60) : "",
          authorId: req.auth!.employeeId ?? req.auth!.uid,
          // Tahrirda vaqt o'zgarmaydi — tartib izoh yozilgan payt bo'yicha.
          at: sameComment && current?.at ? current.at : Timestamp.fromMillis(atMs ?? Date.now()),
        },
      });
      applied = true;
    });

    res.json({ ok: true, applied });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Bir martalik to'ldirish: `lastComment` maydoni paydo bo'lishidan oldingi
 * FAOL buyurtmalar uchun oxirgi izoh o'qib yoziladi. Bajarilgach belgi
 * qo'yiladi va keyingi chaqiruvlar darhol "skipped" qaytaradi — admin
 * panel har ochilganda qaytadan yuzlab o'qish bo'lmaydi.
 */
commentsRouter.post("/adminBackfillLastComment", withAuth, requireAdmin, async (req, res) => {
  try {
    const marker = db.collection("settings").doc("lastCommentBackfill");
    if (req.body?.force !== true && (await marker.get()).exists) {
      return res.json({ ok: true, skipped: true });
    }

    const snap = await db.collection("orders").where("status", "in", ACTIVE_STATUSES).get();
    const targets = snap.docs.filter((d) => d.data().lastComment === undefined);

    let updated = 0;
    for (let i = 0; i < targets.length; i += 20) {
      const chunk = targets.slice(i, i + 20);
      const batch = db.batch();
      await Promise.all(
        chunk.map(async (doc) => {
          const latest = await doc.ref.collection("comments").orderBy("createdAt", "desc").limit(1).get();
          if (latest.empty) return;
          const c = latest.docs[0].data();
          batch.update(doc.ref, {
            lastComment: {
              commentId: latest.docs[0].id,
              text: String(c.text ?? "").trim().slice(0, PREVIEW_LENGTH),
              authorName: String(c.authorName ?? ""),
              authorId: String(c.authorId ?? ""),
              at: c.createdAt instanceof Timestamp ? c.createdAt : Timestamp.now(),
            },
          });
          updated += 1;
        }),
      );
      await batch.commit();
    }

    await marker.set({ doneAt: Timestamp.now(), scanned: snap.size, updated });
    res.json({ ok: true, scanned: snap.size, updated });
  } catch (err) {
    sendError(res, err);
  }
});

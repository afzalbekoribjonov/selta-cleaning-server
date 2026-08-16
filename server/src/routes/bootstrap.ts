import { Router } from "express";
import { db, auth } from "../lib/admin";
import { ApiError, sendError } from "../lib/authz";

export const bootstrapRouter = Router();

/**
 * Birinchi admin hisobini yaratish — tizimda hali birorta ham admin
 * bo'lmagan holatga xos "tuxum-tovuq" muammosini hal qiladi (boshqa barcha
 * admin operatsiyalari allaqachon admin bo'lishni talab qiladi). Faqat BIR
 * MARTA ishlaydi: `settings/bootstrap` hujjatidagi bayroq orqali o'z-o'zini
 * o'chiradi — alohida maxfiy kalit boshqarish shart emas.
 */
bootstrapRouter.post("/bootstrapAdmin", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email?.trim() || !password || password.length < 6) {
      throw new ApiError(400, "invalid-argument", "Email va kamida 6 belgili parol talab qilinadi");
    }

    const flagRef = db.collection("settings").doc("bootstrap");

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(flagRef);
      if (snap.data()?.adminCreated) {
        throw new ApiError(410, "already-done", "Birinchi admin allaqachon yaratilgan");
      }
      tx.set(flagRef, { adminCreated: true });
    });

    try {
      const user = await auth.createUser({ email: email.trim(), password });
      await auth.setCustomUserClaims(user.uid, { role: "admin" });
      res.json({ uid: user.uid, email: user.email });
    } catch (err) {
      // Foydalanuvchi yaratilmadi — bayroqni qayta urinish imkoni uchun tiklaymiz.
      await flagRef.set({ adminCreated: false });
      throw err;
    }
  } catch (err) {
    sendError(res, err);
  }
});

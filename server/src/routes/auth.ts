import { Router } from "express";
import { db, auth } from "../lib/admin";
import { verifyPin, isValidFourDigitPin } from "../lib/pin";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import type { Department } from "../lib/pipeline";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const FIXED_DEPARTMENTS = new Set(["dispatcher", "worker", "delivery", "qc"]);

export const authRouter = Router();

/**
 * Bo'lim tanlash ekrani PIN kiritishdan OLDIN xodimlar ro'yxatini ko'rsatishi
 * kerak (talab #2) — bu payt foydalanuvchi hali autentifikatsiyadan
 * o'tmagan, shuning uchun bu endpoint ochiq (auth talab qilinmaydi). To'liq
 * `employees` hujjati o'rniga faqat ism/id qaytariladi — telefon, maosh va
 * PIN xesh kabi nozik maydonlar hech qachon bu yo'l orqali chiqarilmaydi.
 *
 * `department: "other"` — mobil ilovaning "Boshqa" havolasi: 4 ta doimiy
 * bo'limga tegishli bo'lmagan (admin panelda "Boshqa" orqali yaratilgan
 * kasblardagi) xodimlar. Xodimlar soni odatda kichik bo'lgani uchun to'liq
 * ro'yxat o'qib, JSda filtrlanadi — Firestore'ning `not-in` operatori
 * `orderBy` bilan qo'shilganda qo'shimcha indeks talab qilishi mumkin,
 * shuning uchun soddaroq va ishonchli yo'l tanlandi.
 */
authRouter.post("/listEmployeesByDepartment", async (req, res) => {
  try {
    const department = req.body?.department as string;

    if (department === "other") {
      const snap = await db.collection("employees").where("status", "==", "active").orderBy("fullName").get();
      const rows = snap.docs
        .map((doc) => ({ id: doc.id, fullName: doc.data().fullName as string, department: doc.data().department as string }))
        .filter((e) => !FIXED_DEPARTMENTS.has(e.department));

      const slugs = [...new Set(rows.map((e) => e.department))];
      const labelEntries = await Promise.all(
        slugs.map(async (slug) => {
          const deptSnap = await db.collection("customDepartments").doc(slug).get();
          return [slug, (deptSnap.data()?.label as string | undefined) ?? slug] as const;
        }),
      );
      const labels = Object.fromEntries(labelEntries);

      res.json({ employees: rows.map((e) => ({ id: e.id, fullName: e.fullName, departmentLabel: labels[e.department] ?? e.department })) });
      return;
    }

    const snap = await db
      .collection("employees")
      .where("department", "==", department as Department)
      .where("status", "==", "active")
      .orderBy("fullName")
      .get();

    res.json({ employees: snap.docs.map((doc) => ({ id: doc.id, fullName: doc.data().fullName as string })) });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xodim o'z ismini tanlagach 4 xonali PIN kiritadi — serverda tekshirilib,
 * to'g'ri bo'lsa custom-claims (role, employeeId, department) bilan Firebase
 * custom token qaytariladi. Klient shu token bilan signInWithCustomToken
 * qiladi; keyingi safar ilova ochilganda Firebase Auth'ning o'zi persist
 * qilgan sessiyasi orqali PIN'siz davom etadi (reja qarori #4).
 */
authRouter.post("/loginWithPin", async (req, res) => {
  try {
    const { employeeId, pin } = req.body ?? {};
    if (!employeeId || !isValidFourDigitPin(pin ?? "")) {
      throw new ApiError(400, "invalid-argument", "employeeId va 4 xonali pin talab qilinadi");
    }

    const employeeRef = db.collection("employees").doc(employeeId);
    const credentialsRef = employeeRef.collection("private").doc("credentials");
    const [employeeSnap, credentialsSnap] = await Promise.all([employeeRef.get(), credentialsRef.get()]);

    if (!employeeSnap.exists || employeeSnap.data()?.status !== "active") {
      throw new ApiError(404, "not-found", "Xodim topilmadi yoki faol emas");
    }
    if (!credentialsSnap.exists) {
      throw new ApiError(412, "failed-precondition", "Xodim uchun PIN o'rnatilmagan");
    }

    const credentials = credentialsSnap.data()!;
    const lockedUntil = credentials.lockedUntil?.toMillis?.() ?? 0;
    if (lockedUntil > Date.now()) {
      throw new ApiError(429, "resource-exhausted", "Juda ko'p noto'g'ri urinish — birozdan so'ng qayta urining");
    }

    const ok = verifyPin(pin, credentials.pinHash);
    if (!ok) {
      const attempts = (credentials.failedAttempts ?? 0) + 1;
      const update: Record<string, unknown> = { failedAttempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
        update.failedAttempts = 0;
      }
      await credentialsRef.update(update);
      throw new ApiError(403, "permission-denied", "PIN noto'g'ri");
    }

    await credentialsRef.update({ failedAttempts: 0, lockedUntil: null });

    const employee = employeeSnap.data()!;
    const uid = credentials.firebaseUid ?? employeeId;
    const token = await auth.createCustomToken(uid, {
      role: employee.department,
      employeeId,
      department: employee.department,
    });

    res.json({ token });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xodim o'z qurilmasining FCM tokenini saqlaydi — server shu token orqali
 * push-bildirishnoma yuboradi (lib/notifications.ts). Har login'da va
 * token yangilanganda chaqiriladi.
 */
authRouter.post("/updateFcmToken", withAuth, async (req: AuthedRequest, res) => {
  try {
    const { fcmToken } = req.body ?? {};
    if (!fcmToken?.trim()) {
      throw new ApiError(400, "invalid-argument", "fcmToken talab qilinadi");
    }
    const employeeId = req.auth!.employeeId;
    if (!employeeId) {
      throw new ApiError(403, "permission-denied", "Xodim hisobi topilmadi");
    }
    await db.collection("employees").doc(employeeId).update({ fcmToken: fcmToken.trim() });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

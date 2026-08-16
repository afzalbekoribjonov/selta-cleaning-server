import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, auth } from "../lib/admin";
import { verifyPin, isValidFourDigitPin } from "../lib/pin";
import type { Department } from "../lib/pipeline";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Bo'lim tanlash ekrani PIN kiritishdan OLDIN xodimlar ro'yxatini ko'rsatishi
 * kerak (talab #2) — bu payt foydalanuvchi hali autentifikatsiyadan
 * o'tmagan. Shuning uchun to'liq `employees` hujjatini o'qish o'rniga faqat
 * shu maqsad uchun ism/id qaytaruvchi ochiq callable ishlatiladi — telefon,
 * maosh va PIN xesh kabi nozik maydonlar hech qachon bu yo'l orqali
 * chiqarilmaydi.
 */
export const listEmployeesByDepartment = onCall<{ department: Department }>(async (request) => {
  const { department } = request.data;
  const snap = await db
    .collection("employees")
    .where("department", "==", department)
    .where("status", "==", "active")
    .orderBy("fullName")
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, fullName: doc.data().fullName as string }));
});

/**
 * Xodim o'z ismini tanlagach 4 xonali PIN kiritadi — serverda tekshirilib,
 * to'g'ri bo'lsa custom-claims (role, employeeId, department) bilan Firebase
 * custom token qaytariladi. Klient shu token bilan signInWithCustomToken
 * qiladi; keyingi safar ilova ochilganda Firebase Auth'ning o'zi persist
 * qilgan sessiyasi orqali PIN'siz davom etadi (reja qarori #4).
 */
export const loginWithPin = onCall<{ employeeId: string; pin: string }>(async (request) => {
  const { employeeId, pin } = request.data;
  if (!employeeId || !isValidFourDigitPin(pin ?? "")) {
    throw new HttpsError("invalid-argument", "employeeId va 4 xonali pin talab qilinadi");
  }

  const employeeRef = db.collection("employees").doc(employeeId);
  const credentialsRef = employeeRef.collection("private").doc("credentials");

  const [employeeSnap, credentialsSnap] = await Promise.all([employeeRef.get(), credentialsRef.get()]);

  if (!employeeSnap.exists || employeeSnap.data()?.status !== "active") {
    throw new HttpsError("not-found", "Xodim topilmadi yoki faol emas");
  }
  if (!credentialsSnap.exists) {
    throw new HttpsError("failed-precondition", "Xodim uchun PIN o'rnatilmagan");
  }

  const credentials = credentialsSnap.data()!;
  const lockedUntil = credentials.lockedUntil?.toMillis?.() ?? 0;
  if (lockedUntil > Date.now()) {
    throw new HttpsError("resource-exhausted", "Juda ko'p noto'g'ri urinish — birozdan so'ng qayta urining");
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
    throw new HttpsError("permission-denied", "PIN noto'g'ri");
  }

  await credentialsRef.update({ failedAttempts: 0, lockedUntil: null });

  const employee = employeeSnap.data()!;
  const uid = credentials.firebaseUid ?? employeeId;
  const token = await auth.createCustomToken(uid, {
    role: employee.department,
    employeeId,
    department: employee.department,
  });

  return { token };
});

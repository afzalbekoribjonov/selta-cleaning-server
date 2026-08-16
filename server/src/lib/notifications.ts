import { db, messaging } from "./admin";
import type { Department } from "./pipeline";

/**
 * Cloud Functions rejasida bu alohida Firestore trigger bo'lishi kerak edi;
 * Express'da alohida trigger shart emas — status o'zgargan joyning o'zida
 * to'g'ridan-to'g'ri chaqiramiz (kamroq murakkab, kechikish yo'q).
 *
 * Xodim FCM tokenini ro'yxatdan o'tkazishi (mobil ilovada login'dan keyin
 * `employees/{id}.fcmToken`ni yozish) alohida, keyingi bosqich ishi — bu
 * yerda faqat yuborish infratuzilmasi tayyorlanadi.
 */
async function tokensForDepartment(department: Department): Promise<string[]> {
  const snap = await db
    .collection("employees")
    .where("department", "==", department)
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => d.data().fcmToken as string | undefined).filter((t): t is string => !!t);
}

async function tokenForEmployee(employeeId: string): Promise<string | null> {
  const snap = await db.collection("employees").doc(employeeId).get();
  return (snap.data()?.fcmToken as string | undefined) ?? null;
}

async function sendToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (tokens.length === 0) return;
  try {
    await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });
  } catch (err) {
    // Bitta push xatosi butun so'rovni yiqitmasligi kerak — status
    // o'zgarishi bildirishnomadan muhimroq.
    console.error("FCM yuborishda xatolik:", err);
  }
}

export async function notifyDepartment(
  department: Department,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const tokens = await tokensForDepartment(department);
  await sendToTokens(tokens, title, body, data);
}

export async function notifyEmployee(employeeId: string, title: string, body: string, data?: Record<string, string>) {
  const token = await tokenForEmployee(employeeId);
  if (token) await sendToTokens([token], title, body, data);
}

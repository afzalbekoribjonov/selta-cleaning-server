import { cert, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Cloud Functions'dagidek avtomatik kredential yo'q — bu server Render'da
 * ishlaydi, shuning uchun to'liq service-account JSON `FIREBASE_SERVICE_ACCOUNT`
 * environment variable orqali beriladi (Render dashboard'da qo'lda kiritiladi,
 * gitga hech qachon qo'shilmaydi).
 */
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable o'rnatilmagan");
}

const serviceAccount = JSON.parse(raw) as ServiceAccount;

initializeApp({ credential: cert(serviceAccount) });

export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

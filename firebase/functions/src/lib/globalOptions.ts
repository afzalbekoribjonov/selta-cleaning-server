import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Firestore bazasi `asia-southeast1`da joylashgan (2026-08-16'da shunday
 * tanlangan) — funksiyalar ham shu regionda bo'lishi kerak, aks holda
 * default `us-central1` ishlatiladi va har bir chaqiruv keraksiz uzoq
 * masofaga (AQSh) borib-kelib keladi. Bu fayl `index.ts`da BIRINCHI import
 * qilinishi shart — boshqa funksiya fayllaridagi `onCall()` chaqiruvlari
 * global sozlamalarni shu yerdan meros qilib oladi.
 */
setGlobalOptions({ region: "asia-southeast1" });

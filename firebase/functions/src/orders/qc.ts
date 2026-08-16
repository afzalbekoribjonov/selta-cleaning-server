import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { assertSignedIn } from "../lib/authz";

/**
 * Sifat nazorati — har bir itemni alohida pass/fail qiladi (talab #3/#6).
 * Agar shu yozuvdan so'ng buyurtmadagi BARCHA itemlar "passed" bo'lsa,
 * buyurtma avtomatik "ready" holatiga o'tadi. Agar bitta item ham "failed"
 * bo'lsa, buyurtma "qc_review"da qoladi — butun buyurtma "ready"ga
 * o'tmaydi, chunki quyidagi tekshiruv itemlar orasida "failed"/"pending"
 * bor-yo'qligini ko'radi va bo'lsa avtomatik o'tishni to'xtatadi.
 */
export const submitItemQc = onCall<{
  orderId: string;
  itemId: string;
  qcStatus: "passed" | "failed";
  qcNote?: string;
}>(async (request) => {
  const uid = assertSignedIn(request);
  const role = request.auth!.token.role as string;
  if (role !== "qc" && role !== "admin") {
    throw new HttpsError("permission-denied", "Faqat Sifat nazorati xodimi bu amalni bajara oladi");
  }

  const { orderId, itemId, qcStatus, qcNote } = request.data;
  const employeeId = (request.auth!.token.employeeId as string) ?? uid;

  const orderRef = db.collection("orders").doc(orderId);
  const itemRef = orderRef.collection("items").doc(itemId);

  await db.runTransaction(async (tx) => {
    const [orderSnap, itemSnap, itemsSnap] = await Promise.all([
      tx.get(orderRef),
      tx.get(itemRef),
      tx.get(orderRef.collection("items")),
    ]);

    if (!orderSnap.exists) throw new HttpsError("not-found", "Buyurtma topilmadi");
    if (!itemSnap.exists) throw new HttpsError("not-found", "Mahsulot topilmadi");

    const order = orderSnap.data()!;
    if (order.status !== "qc_review") {
      throw new HttpsError("failed-precondition", "Buyurtma sifat nazorati bosqichida emas");
    }

    tx.update(itemRef, {
      qcStatus,
      qcNote: qcNote ?? null,
      qcBy: employeeId,
      qcAt: FieldValue.serverTimestamp(),
    });

    const allPassed = itemsSnap.docs.every((doc) =>
      doc.id === itemId ? qcStatus === "passed" : doc.data().qcStatus === "passed",
    );

    if (allPassed) {
      tx.update(orderRef, { status: "ready", updatedAt: FieldValue.serverTimestamp() });
      tx.set(orderRef.collection("statusHistory").doc(), {
        fromStatus: "qc_review",
        toStatus: "ready",
        changedBy: employeeId,
        changedAt: FieldValue.serverTimestamp(),
        note: "Barcha mahsulotlar sifat nazoratidan o'tdi",
      });
    }
  });

  return { ok: true };
});

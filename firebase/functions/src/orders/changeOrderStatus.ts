import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { isValidTransition, type ServiceType } from "../lib/pipeline";
import { assertSignedIn } from "../lib/authz";

/**
 * Har bir qo'lda bosiladigan status o'tishi qaysi bo'lim tomonidan
 * qilinishi mumkinligi. `qc_review -> ready` bu yerda YO'Q — u faqat
 * barcha itemlar sifat nazoratidan o'tganda submitItemQc ichida avtomatik
 * sodir bo'ladi (talab #6).
 */
const MANUAL_TRANSITIONS: Record<ServiceType, Record<string, string[]>> = {
  pickup: {
    "new->picked_up": ["delivery"],
    "picked_up->brought_in": ["delivery"],
    "brought_in->washing": ["worker"],
    "washing->packing": ["worker"],
    "packing->qc_review": ["worker"],
    "ready->done": ["delivery"],
  },
  onsite: {
    "new->team_assigned": ["dispatcher", "qc"],
    "team_assigned->in_progress": ["worker", "delivery", "qc"],
    "in_progress->done": ["worker", "delivery", "qc"],
  },
};

export const changeOrderStatus = onCall<{ orderId: string; toStatus: string; note?: string }>(async (request) => {
  const uid = assertSignedIn(request);
  const { orderId, toStatus, note } = request.data;
  const role = request.auth!.token.role as string;
  const employeeId = (request.auth!.token.employeeId as string) ?? uid;

  const orderRef = db.collection("orders").doc(orderId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError("not-found", "Buyurtma topilmadi");

    const order = snap.data()!;
    const fromStatus = order.status as string;
    const serviceType = order.serviceType as ServiceType;

    if (!isValidTransition(serviceType, fromStatus, toStatus)) {
      throw new HttpsError("failed-precondition", `${fromStatus} -> ${toStatus} o'tishi ruxsat etilmagan`);
    }

    const allowedRoles = MANUAL_TRANSITIONS[serviceType][`${fromStatus}->${toStatus}`] ?? [];
    const isOnsiteTeamMember =
      serviceType === "onsite" && Array.isArray(order.assignedTeam) && order.assignedTeam.includes(employeeId);
    if (role !== "admin" && !allowedRoles.includes(role) && !isOnsiteTeamMember) {
      throw new HttpsError("permission-denied", "Bu o'tish uchun ruxsatingiz yo'q");
    }

    tx.update(orderRef, {
      status: toStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(orderRef.collection("statusHistory").doc(), {
      fromStatus,
      toStatus,
      changedBy: employeeId,
      changedAt: FieldValue.serverTimestamp(),
      note: note ?? null,
    });
  });

  return { ok: true };
});

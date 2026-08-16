import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { computeDueDate, type ServiceType } from "../lib/pipeline";
import { assertSignedIn } from "../lib/authz";

interface CreateOrderInput {
  customerName: string;
  phone: string;
  location: string;
  serviceType: ServiceType;
  tariff: "express" | "comfort" | "standart" | "premium";
  gpsCoords?: string;
}

/**
 * Dispetcher "Yangi buyurtma" formasi (talab #11): Ism familiya, Telefon,
 * Mo'ljal, Xizmat turi, Tarif. Mahsulotlar/itemlar bu bosqichda kiritilmaydi —
 * ular keyinroq (olib kelish/joyida yuvish jarayonida) qo'shiladi.
 *
 * `orderNumber` counters/orders hujjatida tranzaksion ravishda 1 dan
 * ketma-ket ajratiladi (talab #7).
 */
export const createOrder = onCall<CreateOrderInput>(async (request) => {
  assertSignedIn(request);
  const role = request.auth!.token.role;
  if (role !== "dispatcher" && role !== "admin") {
    throw new HttpsError("permission-denied", "Faqat dispetcher yangi buyurtma qo'sha oladi");
  }

  const { customerName, phone, location, serviceType, tariff } = request.data;
  if (!customerName?.trim() || !phone?.trim() || !location?.trim()) {
    throw new HttpsError("invalid-argument", "Ism, telefon va mo'ljal majburiy");
  }
  if (serviceType !== "pickup" && serviceType !== "onsite") {
    throw new HttpsError("invalid-argument", "Xizmat turi noto'g'ri");
  }

  const counterRef = db.collection("counters").doc("orders");
  const orderRef = db.collection("orders").doc();

  const orderNumber = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const next = (counterSnap.data()?.value ?? 0) + 1;
    tx.set(counterRef, { value: next }, { merge: true });

    const now = new Date();
    const dueDate = computeDueDate(now, tariff);
    const employeeId = request.auth!.token.employeeId ?? request.auth!.uid;

    tx.set(orderRef, {
      orderNumber: next,
      customerName: customerName.trim(),
      phone: phone.trim(),
      location: location.trim(),
      gpsCoords: request.data.gpsCoords ?? null,
      serviceType,
      tariff,
      status: "new",
      assignedTeam: [],
      totalArea: 0,
      totalPrice: 0,
      createdBy: employeeId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      dueDate,
    });

    tx.set(orderRef.collection("statusHistory").doc(), {
      fromStatus: null,
      toStatus: "new",
      changedBy: employeeId,
      changedAt: FieldValue.serverTimestamp(),
    });

    return next;
  });

  return { orderId: orderRef.id, orderNumber };
});

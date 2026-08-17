import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { computeDueDate, isValidTransition, type ServiceType } from "../lib/pipeline";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import { notifyDepartment, notifyEmployee } from "../lib/notifications";
import { computeItems, type ItemInput } from "../lib/pricing";

/** qc_review'ga yetgunga qadar itemlar tahrirlanishi mumkin (talab: dastavchik
 * mijoz oldida, keyin ishchi "Sexga keldi"da aniqlashtiradi). */
const ITEM_LOCKED_STATUSES = new Set(["qc_review", "ready", "done"]);

function assertItemsEditable(order: Record<string, unknown>, role: string, employeeId: string) {
  if (ITEM_LOCKED_STATUSES.has(order.status as string)) {
    throw new ApiError(412, "failed-precondition", "Buyurtma sifat nazoratiga yuborilgan — mahsulotlarni endi tahrirlab bo'lmaydi");
  }
  const isTeamMember =
    order.serviceType === "onsite" && Array.isArray(order.assignedTeam) && (order.assignedTeam as string[]).includes(employeeId);
  if (!["worker", "delivery", "admin"].includes(role) && !isTeamMember) {
    throw new ApiError(403, "permission-denied", "Bu amal uchun ruxsatingiz yo'q");
  }
}

export const ordersRouter = Router();

/**
 * Dispetcher "Yangi buyurtma" formasi (talab #11): Ism familiya, Telefon,
 * Mo'ljal, Xizmat turi, Tarif. Mahsulotlar/itemlar bu bosqichda kiritilmaydi —
 * ular keyinroq (olib kelish/joyida yuvish jarayonida) qo'shiladi.
 *
 * `orderNumber` counters/orders hujjatida tranzaksion ravishda 1 dan
 * ketma-ket ajratiladi (talab #7).
 */
ordersRouter.post("/createOrder", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "dispatcher" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat dispetcher yangi buyurtma qo'sha oladi");
    }

    const { customerName, phone, location, serviceType, tariff, gpsCoords } = req.body ?? {};
    if (!customerName?.trim() || !phone?.trim() || !location?.trim()) {
      throw new ApiError(400, "invalid-argument", "Ism, telefon va mo'ljal majburiy");
    }
    if (serviceType !== "pickup" && serviceType !== "onsite") {
      throw new ApiError(400, "invalid-argument", "Xizmat turi noto'g'ri");
    }

    const counterRef = db.collection("counters").doc("orders");
    const orderRef = db.collection("orders").doc();
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    const orderNumber = await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const next = (counterSnap.data()?.value ?? 0) + 1;
      tx.set(counterRef, { value: next }, { merge: true });

      const dueDate = computeDueDate(new Date(), tariff);

      tx.set(orderRef, {
        orderNumber: next,
        customerName: customerName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        gpsCoords: gpsCoords ?? null,
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

    if (serviceType === "pickup") {
      await notifyDepartment("delivery", "Yangi buyurtma", `#${orderNumber} — olib ketish kerak`, {
        orderId: orderRef.id,
      });
    } else {
      await notifyDepartment("qc", "Yangi joyida-yuvish buyurtmasi", `#${orderNumber} — jamoa biriktirish kerak`, {
        orderId: orderRef.id,
      });
    }

    res.json({ orderId: orderRef.id, orderNumber });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Dispetcher buyurtma ma'lumotlarini tahrirlashi (talab #11) — mijoz
 * ma'lumotlari, mo'ljal, tarif. Status bu yerdan o'zgarmaydi (faqat
 * changeOrderStatus orqali) — tarif o'zgarsa dueDate qayta hisoblanadi.
 */
ordersRouter.post("/updateOrder", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "dispatcher" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat dispetcher buyurtmani tahrirlay oladi");
    }

    const { orderId, customerName, phone, location, tariff, gpsCoords } = req.body ?? {};
    if (!orderId) throw new ApiError(400, "invalid-argument", "orderId talab qilinadi");
    if (!customerName?.trim() || !phone?.trim() || !location?.trim()) {
      throw new ApiError(400, "invalid-argument", "Ism, telefon va mo'ljal majburiy");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = snap.data()!;

      const update: Record<string, unknown> = {
        customerName: customerName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        gpsCoords: gpsCoords ?? order.gpsCoords ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: employeeId,
      };

      if (tariff && tariff !== order.tariff) {
        update.tariff = tariff;
        const createdAt = order.createdAt?.toDate?.() ?? new Date();
        update.dueDate = computeDueDate(createdAt, tariff);
      }

      tx.update(orderRef, update);
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

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

/** Muvaffaqiyatli o'tishdan keyin tegishli bo'limga bildirishnoma. */
async function notifyOnTransition(orderNumber: number, orderId: string, toStatus: string) {
  const events: Record<string, [string, string, string]> = {
    brought_in: ["worker", "Yangi ish", `#${orderNumber} — aniqlashtirish/yuvish kerak`],
    qc_review: ["qc", "Sifat nazoratiga tushdi", `#${orderNumber} — tekshirish kerak`],
    ready: ["delivery", "Yetkazishga tayyor", `#${orderNumber} — mijozga qaytarish kerak`],
  };
  const event = events[toStatus];
  if (event) {
    const [department, title, body] = event;
    await notifyDepartment(department as Parameters<typeof notifyDepartment>[0], title, body, { orderId });
  }
}

ordersRouter.post("/changeOrderStatus", withAuth, async (req: AuthedRequest, res) => {
  try {
    const { orderId, toStatus, note, collectedAmount, gpsCoords } = req.body ?? {};
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    const orderRef = db.collection("orders").doc(orderId);
    let orderNumber = 0;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");

      const order = snap.data()!;
      orderNumber = order.orderNumber;
      const fromStatus = order.status as string;
      const serviceType = order.serviceType as ServiceType;

      if (!isValidTransition(serviceType, fromStatus, toStatus)) {
        throw new ApiError(412, "failed-precondition", `${fromStatus} -> ${toStatus} o'tishi ruxsat etilmagan`);
      }

      const allowedRoles = MANUAL_TRANSITIONS[serviceType][`${fromStatus}->${toStatus}`] ?? [];
      const isOnsiteTeamMember =
        serviceType === "onsite" && Array.isArray(order.assignedTeam) && order.assignedTeam.includes(employeeId);
      if (role !== "admin" && !allowedRoles.includes(role) && !isOnsiteTeamMember) {
        throw new ApiError(403, "permission-denied", "Bu o'tish uchun ruxsatingiz yo'q");
      }

      // Ishchi mahsulotlarni belgilamasdan yuvishni boshlay olmaydi (talab
      // #3'ning tabiiy natijasi — har item o'z sub-ID'iga ega bo'lishi kerak).
      if (fromStatus === "brought_in" && toStatus === "washing") {
        const itemsSnap = await tx.get(orderRef.collection("items"));
        if (itemsSnap.empty) {
          throw new ApiError(412, "failed-precondition", "Avval mahsulotlarni belgilang");
        }
      }

      // Maosh hisob-kitobi uchun (talab #13) — qaysi xodim buyurtmani olib
      // ketgani/yuvgani/yetkazgani shu holat o'tishlari orqali qayd etiladi.
      const attributionUpdate: Record<string, unknown> = {};
      if (toStatus === "picked_up") {
        attributionUpdate.pickedUpBy = employeeId;
        // Dastavchik mijoz manzilida bo'lgan chog'da GPS majburiy — keyinroq
        // "Yo'lga chiqish" tugmasi shu koordinata orqali marshrut tuzadi.
        // "lat,lng" ko'rinishidagi satr sifatida saqlanadi (order.gpsCoords
        // bilan bir xil format — admin_web/mobile Order modeli string kutadi).
        if (typeof gpsCoords !== "string" || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(gpsCoords.trim())) {
          throw new ApiError(400, "invalid-argument", "GPS manzilini saqlash majburiy");
        }
        attributionUpdate.gpsCoords = gpsCoords.trim();
      }
      if (fromStatus === "washing" && toStatus === "packing") attributionUpdate.washedBy = employeeId;
      if (toStatus === "done") {
        attributionUpdate.deliveredBy = employeeId;
        if (typeof collectedAmount === "number" && collectedAmount > 0) {
          attributionUpdate.collectedAmount = collectedAmount;
        }
      }

      tx.update(orderRef, { status: toStatus, updatedAt: FieldValue.serverTimestamp(), ...attributionUpdate });
      tx.set(orderRef.collection("statusHistory").doc(), {
        fromStatus,
        toStatus,
        changedBy: employeeId,
        changedAt: FieldValue.serverTimestamp(),
        note: note ?? null,
      });
    });

    await notifyOnTransition(orderNumber, orderId, toStatus);

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Sifat nazorati — har bir itemni alohida pass/fail qiladi (talab #3/#6).
 * Agar shu yozuvdan so'ng buyurtmadagi BARCHA itemlar "passed" bo'lsa,
 * buyurtma avtomatik "ready" holatiga o'tadi. Agar bitta item ham "failed"
 * bo'lsa, buyurtma "qc_review"da qoladi.
 */
ordersRouter.post("/submitItemQc", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "qc" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat Sifat nazorati xodimi bu amalni bajara oladi");
    }

    const { orderId, itemId, qcStatus, qcNote } = req.body ?? {};
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    const orderRef = db.collection("orders").doc(orderId);
    const itemRef = orderRef.collection("items").doc(itemId);

    let becameReady = false;
    let orderNumber = 0;
    let anyFailed = false;
    let washedBy: string | undefined;

    await db.runTransaction(async (tx) => {
      const [orderSnap, itemSnap, itemsSnap] = await Promise.all([
        tx.get(orderRef),
        tx.get(itemRef),
        tx.get(orderRef.collection("items")),
      ]);

      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      if (!itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

      const order = orderSnap.data()!;
      orderNumber = order.orderNumber;
      washedBy = order.washedBy as string | undefined;
      if (order.status !== "qc_review") {
        throw new ApiError(412, "failed-precondition", "Buyurtma sifat nazorati bosqichida emas");
      }

      tx.update(itemRef, {
        qcStatus,
        qcNote: qcNote ?? null,
        qcBy: employeeId,
        qcAt: FieldValue.serverTimestamp(),
      });

      const finalStatuses = itemsSnap.docs.map((doc) => (doc.id === itemId ? qcStatus : doc.data().qcStatus));
      const allPassed = finalStatuses.every((s) => s === "passed");
      anyFailed = finalStatuses.some((s) => s === "failed");

      if (allPassed) {
        becameReady = true;
        tx.update(orderRef, { status: "ready", hasFailedItem: false, updatedAt: FieldValue.serverTimestamp() });
        tx.set(orderRef.collection("statusHistory").doc(), {
          fromStatus: "qc_review",
          toStatus: "ready",
          changedBy: employeeId,
          changedAt: FieldValue.serverTimestamp(),
          note: "Barcha mahsulotlar sifat nazoratidan o'tdi",
        });
      } else {
        tx.update(orderRef, { hasFailedItem: anyFailed, updatedAt: FieldValue.serverTimestamp() });
      }
    });

    if (becameReady) {
      await notifyDepartment("delivery", "Yetkazishga tayyor", `#${orderNumber} — mijozga qaytarish kerak`, {
        orderId,
      });
    } else if (qcStatus === "failed") {
      const title = "Qayta ishlov kerak";
      const body = `#${orderNumber} — mahsulot sifat nazoratidan o'tmadi${qcNote ? `: ${qcNote}` : ""}`;
      if (washedBy) {
        await notifyEmployee(washedBy, title, body, { orderId });
      } else {
        await notifyDepartment("worker", title, body, { orderId });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Sifat nazorati butun buyurtmaga umumiy baho qo'yadi (1-5) — har bir
 * mahsulotning alohida pass/fail holatidan tashqari, upakovka/umumiy
 * ishning sifatini baholash uchun. Istalgan payt (qc_review yoki ready
 * bosqichida) qayta yozilishi mumkin.
 */
ordersRouter.post("/submitOrderQcRating", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "qc" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat Sifat nazorati xodimi bu amalni bajara oladi");
    }

    const { orderId, rating, note } = req.body ?? {};
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw new ApiError(400, "invalid-argument", "Baho 1 dan 5 gacha bo'lishi kerak");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");

    await orderRef.update({
      qcRating: ratingNum,
      qcRatingNote: note?.toString()?.trim() || null,
      qcRatedBy: employeeId,
      qcRatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Dastavchik (mijoz oldida, ixtiyoriy) yoki ishchi ("Sexga keldi"da)
 * buyurtmaga mahsulot qo'shadi — har biriga tartib raqami avtomatik
 * beriladi (talab #3/#6: "1/1, 1/2..." kabi ko'rsatish uchun asos).
 * Narx katalog + mahsulot holati ustama foizidan serverda hisoblanadi
 * (talab #2: klient narxga ishonilmaydi, faqat calcType='fixed' bundan
 * mustasno — qo'lda kiritilgan maxsus item).
 */
ordersRouter.post("/addOrderItems", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, items } = req.body ?? {};
    if (!orderId || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "invalid-argument", "Kamida bitta mahsulot kerak");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const itemsRef = orderRef.collection("items");

    const orderSnapPre = await orderRef.get();
    if (!orderSnapPre.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
    assertItemsEditable(orderSnapPre.data()!, role, employeeId);

    const computed = await computeItems(items as ItemInput[], orderSnapPre.data()!.tariff as string | undefined);

    await db.runTransaction(async (tx) => {
      const [orderSnap, existingItemsSnap] = await Promise.all([tx.get(orderRef), tx.get(itemsRef)]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      assertItemsEditable(orderSnap.data()!, role, employeeId);

      let nextNumber = existingItemsSnap.size + 1;
      let addedArea = 0;
      let addedPrice = 0;

      for (const item of computed) {
        tx.set(itemsRef.doc(), {
          itemNumber: nextNumber,
          ...item,
          qcStatus: "pending",
          addedBy: employeeId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        addedArea += item.area;
        addedPrice += item.price;
        nextNumber++;
      }

      tx.update(orderRef, {
        totalArea: FieldValue.increment(addedArea),
        totalPrice: FieldValue.increment(addedPrice),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Mavjud itemni tahrirlash — faqat buyurtma hali qulflanmagan bosqichda. */
ordersRouter.post("/updateOrderItem", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, itemId, item } = req.body ?? {};
    if (!orderId || !itemId || !item) {
      throw new ApiError(400, "invalid-argument", "orderId, itemId va item majburiy");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const itemRef = orderRef.collection("items").doc(itemId);

    const orderSnapPre = await orderRef.get();
    if (!orderSnapPre.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");

    const [computed] = await computeItems([item as ItemInput], orderSnapPre.data()!.tariff as string | undefined);

    await db.runTransaction(async (tx) => {
      const [orderSnap, itemSnap] = await Promise.all([tx.get(orderRef), tx.get(itemRef)]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      if (!itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");
      assertItemsEditable(orderSnap.data()!, role, employeeId);

      const prevPrice = Number(itemSnap.data()!.price) || 0;
      const prevArea = Number(itemSnap.data()!.area) || 0;

      tx.update(itemRef, { ...computed, updatedAt: FieldValue.serverTimestamp() });
      tx.update(orderRef, {
        totalArea: FieldValue.increment(computed.area - prevArea),
        totalPrice: FieldValue.increment(computed.price - prevPrice),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Itemni o'chirish — faqat buyurtma hali qulflanmagan bosqichda. */
ordersRouter.post("/deleteOrderItem", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, itemId } = req.body ?? {};
    if (!orderId || !itemId) {
      throw new ApiError(400, "invalid-argument", "orderId va itemId majburiy");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const itemRef = orderRef.collection("items").doc(itemId);

    await db.runTransaction(async (tx) => {
      const [orderSnap, itemSnap] = await Promise.all([tx.get(orderRef), tx.get(itemRef)]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      if (!itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");
      assertItemsEditable(orderSnap.data()!, role, employeeId);

      const price = Number(itemSnap.data()!.price) || 0;
      const area = Number(itemSnap.data()!.area) || 0;

      tx.delete(itemRef);
      tx.update(orderRef, {
        totalArea: FieldValue.increment(-area),
        totalPrice: FieldValue.increment(-price),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Dispetcher yoki Sifat nazorati joyida-yuvish buyurtmasiga jamoa
 * biriktiradi (talab #14). Faqat "new" holatidagi joyida-yuvish
 * buyurtmalariga qo'llaniladi.
 */
ordersRouter.post("/assignTeam", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "dispatcher" && role !== "qc" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat dispetcher yoki sifat nazorati jamoa biriktira oladi");
    }

    const { orderId, employeeIds } = req.body ?? {};
    if (!orderId || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      throw new ApiError(400, "invalid-argument", "Kamida bitta xodim tanlang");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    let orderNumber = 0;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = snap.data()!;
      orderNumber = order.orderNumber;

      if (order.serviceType !== "onsite") {
        throw new ApiError(412, "failed-precondition", "Faqat joyida yuvish buyurtmalariga jamoa biriktiriladi");
      }
      if (order.status !== "new") {
        throw new ApiError(412, "failed-precondition", "Jamoa faqat yangi buyurtmaga biriktiriladi");
      }

      tx.update(orderRef, {
        assignedTeam: employeeIds,
        status: "team_assigned",
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(orderRef.collection("statusHistory").doc(), {
        fromStatus: "new",
        toStatus: "team_assigned",
        changedBy: employeeId,
        changedAt: FieldValue.serverTimestamp(),
      });
    });

    for (const empId of employeeIds as string[]) {
      await notifyEmployee(empId, "Joyida yuvishga biriktirildingiz", `#${orderNumber} — yangi buyurtma jamoasi`, {
        orderId,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

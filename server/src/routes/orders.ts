import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { computeDueDate, isValidTransition, isValidItemTransition, type ServiceType } from "../lib/pipeline";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { notifyDepartment, notifyEmployee } from "../lib/notifications";
import { computeItems, type ItemInput } from "../lib/pricing";

/**
 * Buyurtma butunlay tugagach ("done") itemlar tahrirlanmaydi. Pickup
 * buyurtmalarida item o'zining ITEM_PIPELINE bosqichi bo'yicha qulflanadi
 * — "pending"/"washing"da hali erkin tahrirlanadi/o'chiriladi (dastavchik
 * mijoz oldida yoki ishchi "Sexga keldi"da aniqlashtiradi), "packing"dan
 * boshlab (ishlov jarayoniga kirgach) endi tahrirlab bo'lmaydi.
 */
const ITEM_STILL_EDITABLE_STATUSES = new Set(["pending", "washing"]);

function assertItemsEditable(
  order: Record<string, unknown>,
  role: string,
  employeeId: string,
  item?: Record<string, unknown> | null,
) {
  if (order.status === "done") {
    throw new ApiError(412, "failed-precondition", "Buyurtma yakunlangan — mahsulotlarni endi tahrirlab bo'lmaydi");
  }
  const isTeamMember =
    order.serviceType === "onsite" && Array.isArray(order.assignedTeam) && (order.assignedTeam as string[]).includes(employeeId);
  if (!["worker", "delivery", "admin"].includes(role) && !isTeamMember) {
    throw new ApiError(403, "permission-denied", "Bu amal uchun ruxsatingiz yo'q");
  }
  if (item && order.serviceType === "pickup" && !ITEM_STILL_EDITABLE_STATUSES.has(item.status as string)) {
    throw new ApiError(412, "failed-precondition", "Bu mahsulot allaqachon ishlov jarayonida — endi tahrirlab bo'lmaydi");
  }
}

export const ordersRouter = Router();

/**
 * Sotuv menejerining "Yangi buyurtma" formasi (talab #3): Ism familiya,
 * Telefon, Mo'ljal, Xizmat turi. Olib kelish (pickup) buyurtmalarida
 * mahsulotlar SHU YERDA, tashkil etilgan ro'yxat sifatida qo'shiladi —
 * har biri O'ZINING tarifiga ega (order-level tarif endi pickup uchun
 * ishlatilmaydi). Joyida yuvish (onsite) buyurtmalar o'zgarishsiz —
 * order-level tarif majburiy, mahsulotlar keyinroq jamoa tashrifida
 * qo'shiladi.
 *
 * `orderNumber` counters/orders hujjatida tranzaksion ravishda 1 dan
 * ketma-ket ajratiladi (talab #7).
 */
ordersRouter.post("/createOrder", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "dispatcher" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat sotuv menejeri yangi buyurtma qo'sha oladi");
    }

    const { customerName, phone, location, serviceType, tariff, gpsCoords, items, notedItems, estimatedPrice, source } = req.body ?? {};
    if (!customerName?.trim() || !phone?.trim() || !location?.trim()) {
      throw new ApiError(400, "invalid-argument", "Ism, telefon va mo'ljal majburiy");
    }
    if (serviceType !== "pickup" && serviceType !== "onsite") {
      throw new ApiError(400, "invalid-argument", "Xizmat turi noto'g'ri");
    }
    const isOnsite = serviceType === "onsite";
    if (isOnsite && !tariff) {
      throw new ApiError(400, "invalid-argument", "Tarif tanlanishi shart");
    }

    // Talab: onsite buyurtmada mijoz aytgan mahsulot nomlarini va
    // taxminiy summani ixtiyoriy ravishda yozib qo'yish — jamoa mijoz
    // uyida haqiqiy mahsulotlarni aniqlashtirib qo'shguncha ma'lumot
    // uchun. Ikkalasi ham majburiy emas.
    const cleanNotedItems =
      Array.isArray(notedItems)
        ? notedItems.map((s) => String(s).trim()).filter((s) => s.length > 0)
        : [];
    const cleanEstimatedPrice = typeof estimatedPrice === "number" && estimatedPrice > 0 ? estimatedPrice : null;

    // Talab: "Manba" — marketing statistikasi uchun, ixtiyoriy. Admin
    // panelda dinamik ravishda boshqariladigan (orderSources kolleksiyasi)
    // hujjat ID'si — bu yerda faqat oddiy shakl tekshiruvi, chunki har
    // safar yaratishda alohida Firestore o'qish shart emas (client faqat
    // o'zining jonli ro'yxatidan tanlagan qiymatni yuboradi).
    const cleanSource = typeof source === "string" && source.trim().length > 0 && source.length <= 100 ? source.trim() : null;

    let computedItems: Awaited<ReturnType<typeof computeItems>> = [];
    if (!isOnsite && Array.isArray(items) && items.length > 0) {
      for (const it of items as ItemInput[]) {
        if (!it.tariff) throw new ApiError(400, "invalid-argument", "Har bir mahsulot uchun tarif tanlanishi shart");
      }
      computedItems = await computeItems(items as ItemInput[]);
    }

    const counterRef = db.collection("counters").doc("orders");
    const orderRef = db.collection("orders").doc();
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    const orderNumber = await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const next = (counterSnap.data()?.value ?? 0) + 1;
      tx.set(counterRef, { value: next }, { merge: true });

      const now = new Date();
      let totalArea = 0;
      let totalPrice = 0;

      tx.set(orderRef, {
        orderNumber: next,
        customerName: customerName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        gpsCoords: gpsCoords ?? null,
        serviceType,
        tariff: isOnsite ? tariff : null,
        status: "new",
        assignedTeam: [],
        totalArea: 0,
        totalPrice: 0,
        createdBy: employeeId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        dueDate: isOnsite ? computeDueDate(now, tariff) : null,
        notedItems: cleanNotedItems,
        estimatedPrice: cleanEstimatedPrice,
        source: cleanSource,
      });

      tx.set(orderRef.collection("statusHistory").doc(), {
        fromStatus: null,
        toStatus: "new",
        changedBy: employeeId,
        changedAt: FieldValue.serverTimestamp(),
      });

      let itemNumber = 1;
      for (const item of computedItems) {
        tx.set(orderRef.collection("items").doc(), {
          itemNumber: itemNumber++,
          ...item,
          status: "pending",
          dueDate: item.tariff ? computeDueDate(now, item.tariff) : null,
          qcStatus: "pending",
          addedBy: employeeId,
          addedByDepartment: role,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        totalArea += item.area;
        totalPrice += item.price;
      }
      if (computedItems.length > 0) {
        tx.update(orderRef, { totalArea, totalPrice });
      }

      return next;
    });

    if (serviceType === "pickup") {
      await notifyDepartment("delivery", "Yangi buyurtma", `#${orderNumber} — olib ketish kerak`, {
        orderId: orderRef.id,
      });
    }
    // Onsite uchun alohida bildirishnoma shart emas — jamoa biriktirish
    // endi to'liq sotuv menejeriga tegishli (talab #5), buyurtmani
    // yaratgan xodimning o'zi buni allaqachon biladi.

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

      // Pickup buyurtmalarda tarif endi item-darajasida — order-level
      // tarifni bu yerdan o'zgartirish faqat onsite uchun ma'noli.
      if (order.serviceType === "onsite" && tariff && tariff !== order.tariff) {
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
 * qilinishi mumkinligi. Pickup buyurtmalarida faqat item'lar mavjud
 * bo'lishidan OLDINGI ikkita o'tish shu yerda — "brought_in"dan keyingi
 * butun jarayon (yuvish/upakovka/yetkazish) endi ITEM-darajasida,
 * changeItemStatus orqali (talab: har bir mahsulot mustaqil pipeline).
 */
const MANUAL_TRANSITIONS: Record<ServiceType, Record<string, string[]>> = {
  pickup: {
    // Talab: dastavchik mijozdan olgach, alohida "Qabul qilindi"
    // bosqichisiz to'g'ridan-to'g'ri "brought_in"ga o'tadi ("Qabul
    // qilindi" filteri qo'shimcha ish talab qilgani uchun olib
    // tashlandi). "picked_up->brought_in" faqat eski (bu o'zgarishdan
    // oldin yaratilgan) "picked_up" holatidagi buyurtmalar uchun saqlanadi.
    "new->brought_in": ["delivery"],
    "picked_up->brought_in": ["delivery"],
  },
  onsite: {
    // Jamoa biriktirish endi to'liq sotuv menejeriga tegishli (talab #5) —
    // "qc" bo'limi olib tashlangan.
    "new->team_assigned": ["dispatcher"],
    "team_assigned->in_progress": ["worker", "delivery"],
    "in_progress->done": ["worker", "delivery"],
  },
};

ordersRouter.post("/changeOrderStatus", withAuth, async (req: AuthedRequest, res) => {
  try {
    const { orderId, toStatus, note, collectedAmount, gpsCoords, actorName } = req.body ?? {};
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

      // Maosh hisob-kitobi uchun (talab #13) — qaysi xodim buyurtmani olib
      // ketgani/yetkazgani shu holat o'tishlari orqali qayd etiladi.
      // `pickedUpByName` — faqat ko'rsatish uchun, mijozdan kelgan (comments'
      // `authorName`'i bilan bir xil ishonch darajasi: haqiqiy `pickedUpBy`
      // har doim server tomonidan tasdiqlangan `employeeId`dan olinadi).
      const attributionUpdate: Record<string, unknown> = {};
      if (fromStatus === "new" && toStatus === "brought_in") {
        attributionUpdate.pickedUpBy = employeeId;
        attributionUpdate.pickedUpAt = FieldValue.serverTimestamp();
        if (typeof actorName === "string" && actorName.trim()) {
          attributionUpdate.pickedUpByName = actorName.trim();
        }
        // Dastavchik mijoz manzilida bo'lgan chog'da GPS majburiy — keyinroq
        // "Yo'lga chiqish" tugmasi shu koordinata orqali marshrut tuzadi.
        // "lat,lng" ko'rinishidagi satr sifatida saqlanadi (order.gpsCoords
        // bilan bir xil format — admin_web/mobile Order modeli string kutadi).
        if (typeof gpsCoords !== "string" || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(gpsCoords.trim())) {
          throw new ApiError(400, "invalid-argument", "GPS manzilini saqlash majburiy");
        }
        attributionUpdate.gpsCoords = gpsCoords.trim();
      }
      if (toStatus === "done") {
        attributionUpdate.deliveredBy = employeeId;
        attributionUpdate.deliveredByEmployees = FieldValue.arrayUnion(employeeId);
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

    if (toStatus === "brought_in") {
      await notifyDepartment("worker", "Yangi ish", `#${orderNumber} — aniqlashtirish/yuvish kerak`, { orderId });
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Item-darajasidagi holat o'tishi — pickup buyurtmalarining asosiy
 * yuvish/upakovka/yetkazish jarayoni endi shu orqali (talab: har bir
 * mahsulot mustaqil pipeline'ga ega). "packing"da istalgan ishchi ✅
 * (ready) yoki ❌ (returned) bosishi mumkin — alohida Sifat nazorati
 * bo'limi endi shart emas (talab #5/#10). "ready->done" — dastavchik
 * item'ni alohida yetkazadi (talab #9: qisman yetkazish). Barcha itemlar
 * "done" bo'lgach, buyurtmaning o'zi avtomatik "done"ga o'tadi.
 */
const ITEM_MANUAL_TRANSITIONS: Record<string, string[]> = {
  "pending->washing": ["worker"],
  "washing->packing": ["worker"],
  "packing->ready": ["worker"],
  "packing->returned": ["worker"],
  "returned->washing": ["worker"],
  "ready->done": ["delivery"],
};

/**
 * Ishchi lavozimi (mutaxassislik/upakovkachi) bo'yicha o'tishni bloklaydi
 * — "Xodimda lavozim bo'lishi kerak buyurtmani holatini o'zgartirishi
 * uchun" talabi. Yuvish bilan bog'liq o'tishlar mahsulot toifasiga mos
 * mutaxassislikni, upakovka o'tishlari esa "upakovkachi" huquqini talab
 * qiladi — lavozimi umuman bo'lmagan ishchi hech narsani o'zgartira
 * olmaydi. Faqat role==="worker" uchun chaqiriladi (admin bypass qiladi).
 */
const WASHING_TRANSITIONS = new Set(["pending->washing", "washing->packing", "returned->washing"]);
const PACKING_TRANSITIONS = new Set(["packing->ready", "packing->returned"]);

function assertWorkerLavozim(
  lavozim: { specializations: string[]; canPack: boolean },
  transitionKey: string,
  category: string | null,
) {
  if (WASHING_TRANSITIONS.has(transitionKey)) {
    if (lavozim.specializations.length === 0) {
      throw new ApiError(403, "permission-denied", "Sizga hali lavozim (mutaxassislik) belgilanmagan — admin bilan bog'laning");
    }
    if (category && !lavozim.specializations.includes(category)) {
      throw new ApiError(403, "permission-denied", "Bu mahsulot toifasi sizning mutaxassisligingizga mos emas");
    }
  }
  if (PACKING_TRANSITIONS.has(transitionKey) && !lavozim.canPack) {
    throw new ApiError(403, "permission-denied", "Sizga upakovkachi huquqi berilmagan — admin bilan bog'laning");
  }
}

ordersRouter.post("/changeItemStatus", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, itemId, toStatus, qcNote, collectedAmount, actorName } = req.body ?? {};
    if (!orderId || !itemId || !toStatus) {
      throw new ApiError(400, "invalid-argument", "orderId, itemId va toStatus majburiy");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const itemRef = orderRef.collection("items").doc(itemId);

    // Transaction ichida oddiy (non-transactional) o'qish qilmaslik uchun
    // — lavozim ma'lumoti oldindan olinadi (qayta urinishlarda bekorga
    // qayta so'ralmasligi uchun ham).
    let workerLavozim: { specializations: string[]; canPack: boolean } | null = null;
    if (role === "worker") {
      const empSnap = await db.collection("employees").doc(employeeId).get();
      workerLavozim = {
        specializations: (empSnap.data()?.specializations as string[] | undefined) ?? [],
        canPack: (empSnap.data()?.canPack as boolean | undefined) ?? false,
      };
    }

    let orderNumber = 0;
    let itemName = "";

    await db.runTransaction(async (tx) => {
      const [orderSnap, itemSnap, itemsSnap] = await Promise.all([
        tx.get(orderRef),
        tx.get(itemRef),
        tx.get(orderRef.collection("items")),
      ]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      if (!itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");

      const order = orderSnap.data()!;
      const item = itemSnap.data()!;
      orderNumber = order.orderNumber;
      itemName = (item.name as string) ?? "Mahsulot";
      if (order.serviceType !== "pickup") {
        throw new ApiError(400, "invalid-argument", "Item-darajasidagi holat faqat olib kelish buyurtmalarida mavjud");
      }

      const fromStatus = item.status as string;
      if (!isValidItemTransition(fromStatus, toStatus)) {
        throw new ApiError(412, "failed-precondition", `${fromStatus} -> ${toStatus} o'tishi ruxsat etilmagan`);
      }
      const transitionKey = `${fromStatus}->${toStatus}`;
      const allowedRoles = ITEM_MANUAL_TRANSITIONS[transitionKey] ?? [];
      if (role !== "admin" && !allowedRoles.includes(role)) {
        throw new ApiError(403, "permission-denied", "Bu o'tish uchun ruxsatingiz yo'q");
      }
      if (role === "worker" && workerLavozim) {
        assertWorkerLavozim(workerLavozim, transitionKey, (item.category as string | undefined) ?? null);
      }

      const itemUpdate: Record<string, unknown> = { status: toStatus, updatedAt: FieldValue.serverTimestamp() };
      // `washedByEmployees`/`deliveredByEmployees` — order-level denormalizatsiya
      // (arrayUnion) faqat maosh/faollik statistikasi UCHUN, xodim
      // ro'yxatlar/hisobotlarda oson topilishi uchun (talab #13/#7) — haqiqiy
      // maosh hisob-kitobi payroll.ts'da item'larning o'zidan hisoblanadi,
      // bu yerdagi massiv faqat "qaysi buyurtmalarda qatnashgan" so'rovlari
      // uchun (collection-group so'rovsiz, qo'shimcha xavfsizlik qoidasi
      // shart emas).
      const orderUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (fromStatus === "washing" && toStatus === "packing") {
        itemUpdate.washedBy = employeeId;
        itemUpdate.washedAt = FieldValue.serverTimestamp();
        orderUpdate.washedByEmployees = FieldValue.arrayUnion(employeeId);
      }
      if (toStatus === "ready") {
        itemUpdate.qcStatus = "passed";
        itemUpdate.qcBy = employeeId;
        itemUpdate.qcAt = FieldValue.serverTimestamp();
        itemUpdate.qcNote = null;
      }
      if (toStatus === "returned") {
        itemUpdate.qcStatus = "failed";
        itemUpdate.qcBy = employeeId;
        itemUpdate.qcAt = FieldValue.serverTimestamp();
        itemUpdate.qcNote = qcNote ?? null;
      }
      if (toStatus === "done") {
        itemUpdate.deliveredBy = employeeId;
        itemUpdate.deliveredAt = FieldValue.serverTimestamp();
        if (typeof actorName === "string" && actorName.trim()) {
          itemUpdate.deliveredByName = actorName.trim();
        }
        orderUpdate.deliveredByEmployees = FieldValue.arrayUnion(employeeId);
        if (typeof collectedAmount === "number" && collectedAmount > 0) {
          itemUpdate.collectedAmount = collectedAmount;
        }
      }

      tx.update(itemRef, itemUpdate);

      if (toStatus === "done" && order.status !== "done") {
        const allDone = itemsSnap.docs.every((d) => (d.id === itemId ? true : d.data().status === "done"));
        if (allDone) {
          orderUpdate.status = "done";
          tx.set(orderRef.collection("statusHistory").doc(), {
            fromStatus: order.status,
            toStatus: "done",
            changedBy: employeeId,
            changedAt: FieldValue.serverTimestamp(),
            note: "Barcha mahsulotlar yetkazildi",
          });
        }
      }
      tx.update(orderRef, orderUpdate);
    });

    if (toStatus === "ready") {
      await notifyDepartment("delivery", "Yetkazishga tayyor", `#${orderNumber} — ${itemName} mijozga qaytarish kerak`, { orderId });
    } else if (toStatus === "returned") {
      const body = `#${orderNumber} — ${itemName} sifat nazoratidan o'tmadi${qcNote ? `: ${qcNote}` : ""}`;
      await notifyDepartment("worker", "Qayta ishlov kerak", body, { orderId });
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Butun buyurtmaga umumiy baho qo'yadi (1-5) — har bir mahsulotning
 * alohida pass/fail holatidan tashqari, upakovka/umumiy ishning
 * sifatini baholash uchun. Istalgan payt qayta yozilishi mumkin. Sifat
 * nazorati bo'limi olib tashlangan (talab #5) — endi ishchi bajaradi.
 */
ordersRouter.post("/submitOrderQcRating", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "worker" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat ishchi bu amalni bajara oladi");
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
    const orderDataPre = orderSnapPre.data()!;
    assertItemsEditable(orderDataPre, role, employeeId);

    const isPickup = orderDataPre.serviceType === "pickup";
    if (isPickup && (items as ItemInput[]).some((i) => !i.tariff)) {
      throw new ApiError(400, "invalid-argument", "Har bir mahsulot uchun tarif tanlanishi shart");
    }

    const computed = await computeItems(items as ItemInput[], orderDataPre.tariff as string | undefined);

    await db.runTransaction(async (tx) => {
      const [orderSnap, existingItemsSnap] = await Promise.all([tx.get(orderRef), tx.get(itemsRef)]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      assertItemsEditable(orderSnap.data()!, role, employeeId);

      let nextNumber = existingItemsSnap.size + 1;
      let addedArea = 0;
      let addedPrice = 0;
      const now = new Date();

      for (const item of computed) {
        tx.set(itemsRef.doc(), {
          itemNumber: nextNumber,
          ...item,
          status: isPickup ? "pending" : null,
          dueDate: isPickup && item.tariff ? computeDueDate(now, item.tariff) : null,
          qcStatus: "pending",
          addedBy: employeeId,
          addedByDepartment: role,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        addedArea += item.area;
        addedPrice += item.price;
        nextNumber++;
      }

      // Dastavchik o'zi qo'shgan mahsulotlar sotuv menejeri oldindan
      // qo'shganlaridan farqli o'laroq alohida qayd etiladi (talab #7) —
      // admin panelda dastavchik profilida oyma-oy statistikaga asos.
      tx.update(orderRef, {
        totalArea: FieldValue.increment(addedArea),
        totalPrice: FieldValue.increment(addedPrice),
        updatedAt: FieldValue.serverTimestamp(),
        ...(role === "delivery" ? { deliveryAddedByEmployees: FieldValue.arrayUnion(employeeId) } : {}),
      });
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Mavjud itemni tahrirlash — faqat buyurtma va item hali qulflanmagan bosqichda. */
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
    const orderDataPre = orderSnapPre.data()!;
    const isPickup = orderDataPre.serviceType === "pickup";
    if (isPickup && !(item as ItemInput).tariff) {
      throw new ApiError(400, "invalid-argument", "Tarif tanlanishi shart");
    }

    const [computed] = await computeItems([item as ItemInput], orderDataPre.tariff as string | undefined);

    await db.runTransaction(async (tx) => {
      const [orderSnap, itemSnap] = await Promise.all([tx.get(orderRef), tx.get(itemRef)]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      if (!itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");
      assertItemsEditable(orderSnap.data()!, role, employeeId, itemSnap.data());

      const prevPrice = Number(itemSnap.data()!.price) || 0;
      const prevArea = Number(itemSnap.data()!.area) || 0;
      const now = new Date();

      tx.update(itemRef, {
        ...computed,
        dueDate: isPickup && computed.tariff ? computeDueDate(now, computed.tariff) : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
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

/** Itemni o'chirish — faqat buyurtma va item hali qulflanmagan bosqichda. */
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
      assertItemsEditable(orderSnap.data()!, role, employeeId, itemSnap.data());

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
 * Sotuv menejeri joyida-yuvish buyurtmasiga jamoa biriktiradi (talab #14,
 * #5: bu ish endi to'liq sotuv menejeriga tegishli). Faqat "new"
 * holatidagi joyida-yuvish buyurtmalariga qo'llaniladi.
 */
ordersRouter.post("/assignTeam", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    if (role !== "dispatcher" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat sotuv menejeri jamoa biriktira oladi");
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

/**
 * Admin — buyurtmani butunlay o'chiradi (istalgan holatda). `recursiveDelete`
 * hujjat bilan birga barcha subkolleksiyalarni (items/comments/statusHistory)
 * ham tozalaydi — aks holda ular "yetim" holatda Firestore'da qolib ketardi.
 */
ordersRouter.post("/adminDeleteOrder", withAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.body ?? {};
    if (!orderId) throw new ApiError(400, "invalid-argument", "orderId majburiy");

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");

    await db.recursiveDelete(orderRef);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

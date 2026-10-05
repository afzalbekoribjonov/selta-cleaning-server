import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireEmployeeFlag, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc } from "../lib/businessTime";
import { dailyActivityDocId, dailyActivityEvents, logDailyActivity } from "../lib/dailyActivity";
import { isValidActionId } from "../lib/idempotency";
import {
  MAX_PREPAYMENT,
  prepaidCredit,
  prepaidToApply,
  prepaymentsOf,
  type PrepaymentEntry,
} from "../lib/prepayments";
import { computeOrderItemsSummary, summaryItemOf, type SummaryItemInput } from "../lib/orderSummary";
import { loadEmployeeNames } from "../lib/employeeNames";
import { isPaymentKind, normalizePaymentSplit, splitPaidAmount, type PaymentKind } from "../lib/payments";
import { phoneVariants } from "../lib/phone";
import { bonusFor, customerKey, loadBonusPercent, prepareCompletionBonus, writeBonus } from "../lib/bonus";

export const paymentsRouter = Router();

/** Bir so'rovda qaytariladigan maksimal yozuv. */
const MAX_PAYMENTS = 500;

/**
 * Buyurtmaning tayyor mahsulotlarini BIR HARAKATDA mijozga topshiradi va
 * to'lovni qayd etadi.
 *
 * NEGA BITTA CHAQIRUV: avval har bir mahsulot alohida "yetkazildi"
 * qilinardi va summa har safar so'ralardi — besh mahsulotli buyurtmada
 * dastavchi oynani besh marta to'ldirardi. Endi summa bitta yetkazish
 * uchun bir marta so'raladi (majburiy), kamomad bo'lsa uning sababi ham
 * shu yerda belgilanadi.
 */
paymentsRouter.post("/deliverOrderItems", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    // Dastavchikdan tashqari "Omborxona" vakolati berilgan xodim ham
    // topshira oladi — ombordagi buyurtmani mijoz o'zi kelib oladi.
    if (role !== "delivery" && role !== "admin") {
      const empSnap = await db.collection("employees").doc(employeeId).get();
      if (empSnap.data()?.canAccessWarehouse !== true) {
        throw new ApiError(403, "permission-denied", "Faqat dastavchik yoki omborxona xodimi buyurtmani topshira oladi");
      }
    }

    const { orderId, itemIds, paidAmount, cashAmount, cardAmount, kind, note, actorName } = req.body ?? {};
    if (!orderId || !Array.isArray(itemIds) || itemIds.length === 0) {
      throw new ApiError(400, "invalid-argument", "orderId va kamida bitta mahsulot kerak");
    }
    if (typeof paidAmount !== "number" || !Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new ApiError(400, "invalid-argument", "Mijozdan olingan summani kiriting");
    }

    // Naqd/karta ulushi tranzaksiyadan OLDIN tekshiriladi — noto'g'ri
    // so'rov bitta ham o'qishsiz rad etiladi.
    const split = normalizePaymentSplit(paidAmount, cashAmount, cardAmount);
    if (!split) {
      throw new ApiError(
        400,
        "invalid-argument",
        "Naqd va karta summalarining yig'indisi olingan summaga teng bo'lishi kerak",
      );
    }

    const orderRef = db.collection("orders").doc(orderId);
    const paymentRef = db.collection("payments").doc();
    const now = new Date();
    const dateKey = businessDateString(now);

    let result: { orderNumber: number; dueAmount: number; prepaidApplied: number; shortfall: number; kind: PaymentKind } | null =
      null;

    await db.runTransaction(async (tx) => {
      const [orderSnap, itemsSnap] = await Promise.all([tx.get(orderRef), tx.get(orderRef.collection("items"))]);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = orderSnap.data()!;
      if (order.serviceType !== "pickup") {
        throw new ApiError(400, "invalid-argument", "Bu amal faqat olib kelish buyurtmalarida");
      }

      const itemsById = new Map(itemsSnap.docs.map((d) => [d.id, d]));
      const targets = (itemIds as string[]).map((id) => {
        const doc = itemsById.get(id);
        if (!doc) throw new ApiError(404, "not-found", "Mahsulot topilmadi");
        if (doc.data().status !== "ready") {
          throw new ApiError(412, "failed-precondition", `"${doc.data().name ?? "Mahsulot"}" yetkazishga tayyor emas`);
        }
        return doc;
      });

      const prices = targets.map((d) => (d.data().price as number | undefined) ?? 0);
      const grossAmount = prices.reduce((sum, p) => sum + p, 0);
      // Oldindan to'langan pul avval shu topshirishga ishlatiladi —
      // dastavchik mijozdan faqat qolganini oladi.
      const prepaidApplied = prepaidToApply(prepaidCredit(order), grossAmount);
      const dueAmount = grossAmount - prepaidApplied;
      const shortfall = Math.max(0, Math.round(dueAmount - paidAmount));

      // Kamomad bo'lsa sababi majburiy — aks holda pul qayerga ketgani
      // hech qayerda qayd etilmay qolardi.
      let resolvedKind: PaymentKind = "full";
      if (shortfall > 0) {
        if (!isPaymentKind(kind) || kind === "full") {
          throw new ApiError(
            400,
            "invalid-argument",
            "Summa to'liq emas — qisman to'lov, qarz yoki chegirmadan birini tanlang",
          );
        }
        resolvedKind = kind;
      }

      const shares = splitPaidAmount(prices, paidAmount);
      // Naqd va karta ALOHIDA taqsimlanadi: kunlik kassa hisobida
      // ikkalasi mustaqil yig'iladi, shuning uchun har biri o'z
      // yig'indisiga aynan teng chiqishi kerak.
      const cashShares = splitPaidAmount(prices, split.cashAmount);
      const cardShares = splitPaidAmount(prices, split.cardAmount);
      const deliveredIds = new Set(targets.map((d) => d.id));
      const remainingItemCount = itemsSnap.docs.filter(
        (d) => !deliveredIds.has(d.id) && d.data().status !== "done",
      ).length;

      const orderNumber = (order.orderNumber as number) ?? 0;
      const customerName = (order.customerName as string) ?? "";
      const phone = (order.phone as string) ?? "";

      // Oxirgi mahsulotlar topshirilsa buyurtma yakunlanadi — mijozga
      // keshbek (lib/bonus.ts). O'qishlari yozishlardan OLDIN bo'lishi shart.
      const completing = remainingItemCount === 0 && order.status !== "done";
      const finishBonus = completing
        ? await prepareCompletionBonus(tx, orderId, order, Math.round(paidAmount), employeeId)
        : null;

      // Har bir topshirilgan mahsulotning yangi holati — buyurtmadagi
      // mahsulotlar nusxasi (itemsMirror) ham aynan shu bilan yangilanadi.
      const itemUpdates = new Map<string, Record<string, unknown>>();
      targets.forEach((doc, i) => {
        const item = doc.data();
        const itemUpdate = {
          status: "done",
          deliveredBy: employeeId,
          deliveredAt: Timestamp.fromDate(now),
          collectedAmount: shares[i],
          updatedAt: FieldValue.serverTimestamp(),
          ...(typeof actorName === "string" && actorName.trim() ? { deliveredByName: actorName.trim() } : {}),
        };
        itemUpdates.set(doc.id, itemUpdate);
        tx.update(doc.ref, itemUpdate);

        logDailyActivity(tx, now, {
          type: "delivered",
          orderId,
          orderNumber,
          customerName,
          phone,
          serviceType: "pickup",
          employeeId,
          itemId: doc.id,
          itemNumber: (item.itemNumber as number | undefined) ?? null,
          itemName: (item.name as string) ?? "Mahsulot",
          calcType: (item.calcType as string | undefined) ?? null,
          qty: (item.qty as number | undefined) ?? null,
          price: (item.price as number | undefined) ?? null,
          collectedAmount: shares[i],
          cashAmount: cashShares[i],
          cardAmount: cardShares[i],
        });
      });

      const orderUpdate: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        deliveredByEmployees: FieldValue.arrayUnion(employeeId),
      };
      if (prepaidApplied > 0) orderUpdate.prepaidUsed = FieldValue.increment(prepaidApplied);

      if (completing) {
        orderUpdate.status = "done";
        orderUpdate.doneAt = FieldValue.serverTimestamp();
        orderUpdate.deliveredBy = employeeId;
        if (finishBonus) orderUpdate.bonusEarned = finishBonus(now);
        tx.set(orderRef.collection("statusHistory").doc(), {
          fromStatus: order.status,
          toStatus: "done",
          changedBy: employeeId,
          changedAt: FieldValue.serverTimestamp(),
          note: "Barcha mahsulotlar yetkazildi",
        });
      }

      const summaryItems: SummaryItemInput[] = itemsSnap.docs.map((d) => summaryItemOf(d, itemUpdates.get(d.id) ?? {}));
      Object.assign(orderUpdate, computeOrderItemsSummary(summaryItems));
      tx.update(orderRef, orderUpdate);

      tx.set(paymentRef, {
        orderId,
        orderNumber,
        customerName,
        phone,
        employeeId,
        dateKey,
        at: Timestamp.fromDate(now),
        itemIds: targets.map((d) => d.id),
        itemCount: targets.length,
        remainingItemCount,
        dueAmount: Math.round(dueAmount),
        // Mahsulotlar narxi va undan oldindan to'lov bilan yopilgani.
        grossAmount: Math.round(grossAmount),
        prepaidApplied,
        paidAmount: Math.round(paidAmount),
        cashAmount: split.cashAmount,
        cardAmount: split.cardAmount,
        shortfall,
        kind: resolvedKind,
        // Chegirma va to'liq to'lov bo'yicha olinadigan narsa qolmaydi.
        settled: resolvedKind === "full" || resolvedKind === "discount",
        settledAt: null,
        settledBy: null,
        settledAmount: 0,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
      });

      result = { orderNumber, dueAmount: Math.round(dueAmount), prepaidApplied, shortfall, kind: resolvedKind };
    });

    res.json({ ok: true, paymentId: paymentRef.id, ...(result ?? {}) });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Qarz yoki qisman to'lovni yopadi. Admin ham, o'sha to'lovni qayd etgan
 * dastavchikning o'zi ham yopa oladi (talab) — mijoz qolgan pulni
 * dastavchikka bergan bo'lishi mumkin.
 */
paymentsRouter.post("/settlePayment", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role!;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { paymentId, amount, cashAmount, cardAmount, note } = req.body ?? {};
    if (!paymentId) throw new ApiError(400, "invalid-argument", "paymentId majburiy");

    const ref = db.collection("payments").doc(paymentId);
    const now = new Date();
    const bonusPercent = await loadBonusPercent();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new ApiError(404, "not-found", "To'lov yozuvi topilmadi");
      const payment = snap.data()!;
      const orderRef = typeof payment.orderId === "string" && payment.orderId ? db.collection("orders").doc(payment.orderId) : null;
      const orderSnap = orderRef ? await tx.get(orderRef) : null;

      if (role !== "admin" && payment.employeeId !== employeeId) {
        throw new ApiError(403, "permission-denied", "Bu yozuvni faqat uni qayd etgan xodim yoki admin yopa oladi");
      }
      if (payment.settled === true) {
        throw new ApiError(412, "failed-precondition", "Bu yozuv allaqachon yopilgan");
      }

      const shortfall = (payment.shortfall as number | undefined) ?? 0;
      const settledAmount = typeof amount === "number" && amount > 0 ? Math.round(amount) : shortfall;

      const split = normalizePaymentSplit(settledAmount, cashAmount, cardAmount);
      if (!split) {
        throw new ApiError(
          400,
          "invalid-argument",
          "Naqd va karta summalarining yig'indisi yopilayotgan summaga teng bo'lishi kerak",
        );
      }

      tx.update(ref, {
        settled: true,
        settledAt: Timestamp.fromDate(now),
        settledBy: employeeId,
        settledAmount,
        settledCashAmount: split.cashAmount,
        settledCardAmount: split.cardAmount,
        settledNote: typeof note === "string" && note.trim() ? note.trim() : null,
      });

      // Buyurtma allaqachon yakunlangan (va bonus tizimida) bo'lsa — qarz
      // yopilgan summadan keshbek. Yakunlanmagan bo'lsa bu pul yakunlanish
      // paytida hisobga olinadi (lib/bonus.ts: prepareCompletionBonus).
      const order = orderSnap?.data();
      const key = customerKey(order?.phone);
      if (orderRef && order && order.status === "done" && typeof order.bonusEarned === "number" && key) {
        const earned = bonusFor(settledAmount, bonusPercent);
        if (earned > 0) {
          writeBonus(
            tx,
            key,
            earned,
            {
              type: "earn",
              amount: earned,
              orderId: orderRef.id,
              orderNumber: (order.orderNumber as number) ?? 0,
              employeeId,
              note: `${bonusPercent}% · yopilgan qarz`,
            },
            { phone: (order.phone as string) ?? "", name: (order.customerName as string) ?? "" },
            now,
          );
          tx.update(orderRef, { bonusEarned: FieldValue.increment(earned) });
        }
      }

      // Yopilgan pul YOPILGAN KUNGA yoziladi: u shu kuni xodim qo'liga
      // tushadi, shuning uchun o'sha kunning kassa hisobida ko'rinishi
      // kerak. Buyurtma esa boshqa kuni yetkazilgan bo'lishi mumkin.
      logDailyActivity(tx, now, {
        type: "settled",
        paymentId,
        orderId: (payment.orderId as string) ?? "",
        orderNumber: (payment.orderNumber as number) ?? 0,
        customerName: (payment.customerName as string) ?? "",
        phone: (payment.phone as string) ?? "",
        serviceType: "pickup",
        employeeId,
        itemName: "Yopilgan to'lov",
        collectedAmount: settledAmount,
        cashAmount: split.cashAmount,
        cardAmount: split.cardAmount,
      });
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Oldindan (qisman) to'lov qabul qilish — admin panelda "Oldindan to'lov"
 * vakolati (`canTakePrepayment`) berilgan xodim yoki admin.
 *
 * Pul SHU KUNI xodim qo'liga tushadi: kunlik jurnalga `prepaid` hodisasi
 * yoziladi va u kassa hisobida (routes/dailyReport.ts) ko'rinadi.
 * Topshirishda esa bu summa mahsulotlar narxidan ayiriladi
 * (yuqoridagi deliverOrderItems, joyida yuvishda changeOrderStatus).
 *
 * Ilova ID'ni o'zi beradi (`prepaymentId`) — takroriy yuborish
 * ikkinchi to'lov yozmaydi.
 */
paymentsRouter.post("/addPrepayment", withAuth, async (req: AuthedRequest, res) => {
  try {
    await requireEmployeeFlag(req, "canTakePrepayment", "Oldindan to'lov qabul qilish huquqingiz yo'q");
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, prepaymentId, amount, cashAmount, cardAmount, note, actorName } = req.body ?? {};

    if (typeof orderId !== "string" || !orderId) throw new ApiError(400, "invalid-argument", "orderId majburiy");
    if (prepaymentId !== undefined && !isValidActionId(prepaymentId)) {
      throw new ApiError(400, "invalid-argument", "prepaymentId noto'g'ri");
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > MAX_PREPAYMENT) {
      throw new ApiError(400, "invalid-argument", "Summa noto'g'ri");
    }
    const paid = Math.round(amount);
    const split = normalizePaymentSplit(paid, cashAmount, cardAmount);
    if (!split) {
      throw new ApiError(400, "invalid-argument", "Naqd va karta summalarining yig'indisi to'lov summasiga teng bo'lishi kerak");
    }

    const id = (prepaymentId as string | undefined) ?? db.collection("orders").doc().id;
    const orderRef = db.collection("orders").doc(orderId);
    const now = new Date();
    let prepaidAmount = 0;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = snap.data()!;
      const existing = prepaymentsOf(order);
      prepaidAmount = (order.prepaidAmount as number | undefined) ?? 0;
      if (existing.some((p) => p.id === id)) return; // Takroriy yuborish.
      if (order.status === "done") {
        throw new ApiError(412, "failed-precondition", "Buyurtma yakunlangan — oldindan to'lov qabul qilinmaydi");
      }

      const entry: PrepaymentEntry = {
        id,
        amount: paid,
        cashAmount: split.cashAmount,
        cardAmount: split.cardAmount,
        at: Timestamp.fromDate(now),
        employeeId,
        employeeName: typeof actorName === "string" && actorName.trim() ? actorName.trim() : null,
        note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
      };
      prepaidAmount += paid;
      tx.update(orderRef, {
        prepayments: [...existing, entry],
        prepaidAmount,
        updatedAt: FieldValue.serverTimestamp(),
      });

      logDailyActivity(tx, now, {
        type: "prepaid",
        paymentId: id,
        orderId,
        orderNumber: (order.orderNumber as number) ?? 0,
        customerName: (order.customerName as string) ?? "",
        phone: (order.phone as string) ?? "",
        serviceType: (order.serviceType as string) ?? "pickup",
        employeeId,
        itemName: "Oldindan to'lov",
        collectedAmount: paid,
        cashAmount: split.cashAmount,
        cardAmount: split.cardAmount,
      });
    });

    res.json({ ok: true, prepaymentId: id, prepaidAmount });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xato kiritilgan oldindan to'lovni bekor qilish. Admin istalgan payt;
 * uni qabul qilgan xodim esa faqat SHU KUNI va kunlik naqd hali kassaga
 * topshirilmagan bo'lsa. Topshirishda ishlatib bo'lingan summa bekor
 * qilinmaydi — pul allaqachon buyurtma hisobiga o'tgan.
 */
paymentsRouter.post("/cancelPrepayment", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, prepaymentId } = req.body ?? {};
    if (typeof orderId !== "string" || !orderId || typeof prepaymentId !== "string" || !prepaymentId) {
      throw new ApiError(400, "invalid-argument", "orderId va prepaymentId majburiy");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const today = businessDateString(new Date());
    const handoverSnap = role === "admin" ? null : await db.collection("cashHandovers").doc(today).get();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = snap.data()!;
      const entries = prepaymentsOf(order);
      const entry = entries.find((p) => p.id === prepaymentId);
      if (!entry) return; // Allaqachon bekor qilingan.

      const dateKey = businessDateString(entry.at.toDate());
      if (role !== "admin") {
        if (entry.employeeId !== employeeId) {
          throw new ApiError(403, "permission-denied", "Faqat o'zingiz qabul qilgan to'lovni bekor qila olasiz");
        }
        if (dateKey !== today) {
          throw new ApiError(412, "failed-precondition", "Faqat bugungi to'lovni bekor qilish mumkin — adminga murojaat qiling");
        }
        if (handoverSnap?.data()?.handedOver?.[employeeId] !== undefined) {
          throw new ApiError(412, "failed-precondition", "Bugungi naqd allaqachon topshirilgan — adminga murojaat qiling");
        }
      }
      if (prepaidCredit(order) < entry.amount) {
        throw new ApiError(412, "failed-precondition", "Bu to'lov topshirishda hisobga olingan — bekor qilib bo'lmaydi");
      }

      tx.update(orderRef, {
        prepayments: entries.filter((p) => p.id !== prepaymentId),
        prepaidAmount: Math.max(0, ((order.prepaidAmount as number | undefined) ?? 0) - entry.amount),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // O'sha kunning kassa hisobidan ham chiqadi.
      tx.delete(
        dailyActivityEvents(dateKey).doc(
          dailyActivityDocId(
            { type: "prepaid", paymentId: prepaymentId, orderId, orderNumber: 0, customerName: "", phone: "", serviceType: "", employeeId: "" },
            dateKey,
          ),
        ),
      );
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

interface PaymentRow {
  id: string;
  orderId: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  employeeId: string;
  employeeName: string;
  dateKey: string;
  at: string | null;
  itemCount: number;
  remainingItemCount: number;
  dueAmount: number;
  paidAmount: number;
  cashAmount: number;
  cardAmount: number;
  shortfall: number;
  kind: PaymentKind;
  settled: boolean;
  settledAt: string | null;
  settledByName: string | null;
  settledAmount: number;
  settledCashAmount: number;
  settledCardAmount: number;
  note: string | null;
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function toRow(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  names: Map<string, string>,
): PaymentRow {
  const p = doc.data();
  const employeeId = (p.employeeId as string) ?? "";
  const settledBy = (p.settledBy as string | null) ?? null;
  const paid = (p.paidAmount as number | undefined) ?? 0;
  const settledAmount = (p.settledAmount as number | undefined) ?? 0;
  return {
    id: doc.id,
    orderId: (p.orderId as string) ?? "",
    orderNumber: (p.orderNumber as number) ?? 0,
    customerName: (p.customerName as string) ?? "",
    phone: (p.phone as string) ?? "",
    employeeId,
    employeeName: names.get(employeeId) ?? "Noma'lum",
    dateKey: (p.dateKey as string) ?? "",
    at: toIso(p.at),
    itemCount: (p.itemCount as number | undefined) ?? 0,
    remainingItemCount: (p.remainingItemCount as number | undefined) ?? 0,
    dueAmount: (p.dueAmount as number | undefined) ?? 0,
    paidAmount: paid,
    // Maydonlar joriy etilishidan oldingi yozuvlarda pul har doim naqd
    // olingan — shuning uchun eski yozuv butunlay naqd deb ko'rsatiladi.
    cashAmount: (p.cashAmount as number | undefined) ?? paid,
    cardAmount: (p.cardAmount as number | undefined) ?? 0,
    shortfall: (p.shortfall as number | undefined) ?? 0,
    kind: (p.kind as PaymentKind) ?? "full",
    settled: p.settled === true,
    settledAt: toIso(p.settledAt),
    settledByName: settledBy ? (names.get(settledBy) ?? "Noma'lum") : null,
    settledAmount,
    settledCashAmount: (p.settledCashAmount as number | undefined) ?? settledAmount,
    settledCardAmount: (p.settledCardAmount as number | undefined) ?? 0,
    note: (p.note as string | null) ?? null,
  };
}

/**
 * Bitta mijozning qarzi, qisman to'lovlari va chegirmalari — umumiy
 * qidiruvdagi mijoz kartasi uchun.
 *
 * Buyurtmalarni ilova o'zi Firestore'dan o'qiydi (internetsiz ham
 * ishlaydi); to'lov yozuvlari esa ilovaga yopiq (firestore.rules), shuning
 * uchun faqat shu yerdan va faqat moliyaga ruxsati borlarga beriladi.
 */
paymentsRouter.post("/customerFinance", withAuth, async (req: AuthedRequest, res) => {
  try {
    await assertCanViewFinance(req);
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    if (phone.replace(/\D/g, "").length < 9) {
      throw new ApiError(400, "invalid-argument", "To'liq telefon raqamini kiriting");
    }

    const [snap, names] = await Promise.all([
      db.collection("payments").where("phone", "in", phoneVariants(phone)).limit(MAX_PAYMENTS).get(),
      loadEmployeeNames(),
    ]);
    const rows = snap.docs.map((d) => toRow(d, names)).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

    const totals = { debtCount: 0, debtAmount: 0, partialCount: 0, partialAmount: 0, discountCount: 0, discountAmount: 0 };
    for (const r of rows) {
      if (r.kind === "debt" && !r.settled) {
        totals.debtCount += 1;
        totals.debtAmount += r.shortfall;
      } else if (r.kind === "partial" && !r.settled) {
        totals.partialCount += 1;
        totals.partialAmount += r.shortfall;
      } else if (r.kind === "discount") {
        totals.discountCount += 1;
        totals.discountAmount += r.shortfall;
      }
    }

    res.json({ rows, totals });
  } catch (err) {
    sendError(res, err);
  }
});

/** Xodim moliyaviy yozuvlarni ko'ra oladimi (admin yoki alohida vakolat). */
async function assertCanViewFinance(req: AuthedRequest): Promise<void> {
  if (req.auth!.role === "admin") return;
  const employeeId = req.auth!.employeeId ?? req.auth!.uid;
  const snap = await db.collection("employees").doc(employeeId).get();
  if (snap.data()?.canViewFinance !== true) {
    throw new ApiError(403, "permission-denied", "Qarz va chegirmalarni ko'rish huquqingiz yo'q");
  }
}

/**
 * Qarzdorlar, qisman to'lovlar va chegirmalar.
 *
 * SO'ROVLAR ATAYLAB BIR MAYDONLI: `settled == false` (ochiq yozuvlar) va
 * `dateKey` oralig'i — ikkalasi ham Firestore avtomatik indeksi bilan
 * ishlaydi. Tur bo'yicha ajratish xotirada bajariladi, chunki
 * (kind + at) kabi birikma qo'shimcha kompozit indeks talab qilardi.
 */
paymentsRouter.post("/listPayments", withAuth, async (req: AuthedRequest, res) => {
  try {
    await assertCanViewFinance(req);

    const scope = req.body?.scope === "history" ? "history" : "outstanding";
    const names = await loadEmployeeNames();

    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (scope === "outstanding") {
      const snap = await db.collection("payments").where("settled", "==", false).limit(MAX_PAYMENTS).get();
      docs = snap.docs;
    } else {
      const to = typeof req.body?.to === "string" ? req.body.to : businessDateString(new Date());
      const fromRaw = typeof req.body?.from === "string" ? req.body.from : null;
      const from = fromRaw ?? businessDateString(new Date(Date.now() - 29 * 24 * 60 * 60_000));
      if (!businessDayRangeUtc(from) || !businessDayRangeUtc(to)) {
        throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
      }
      const snap = await db
        .collection("payments")
        .where("dateKey", ">=", from)
        .where("dateKey", "<=", to)
        .limit(MAX_PAYMENTS)
        .get();
      docs = snap.docs;
    }

    const rows = docs.map((d) => toRow(d, names)).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

    const totals = {
      debtCount: 0,
      debtAmount: 0,
      partialCount: 0,
      partialAmount: 0,
      discountCount: 0,
      discountAmount: 0,
    };
    for (const r of rows) {
      if (r.kind === "debt" && !r.settled) {
        totals.debtCount += 1;
        totals.debtAmount += r.shortfall;
      } else if (r.kind === "partial" && !r.settled) {
        totals.partialCount += 1;
        totals.partialAmount += r.shortfall;
      } else if (r.kind === "discount") {
        totals.discountCount += 1;
        totals.discountAmount += r.shortfall;
      }
    }

    res.json({ scope, rows, totals });
  } catch (err) {
    sendError(res, err);
  }
});

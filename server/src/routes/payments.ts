import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc } from "../lib/businessTime";
import { logDailyActivity } from "../lib/dailyActivity";
import { computeOrderItemsSummary, type SummaryItemInput } from "../lib/orderSummary";
import { loadEmployeeNames } from "../lib/employeeNames";
import { isPaymentKind, splitPaidAmount, type PaymentKind } from "../lib/payments";

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
    if (role !== "delivery" && role !== "admin") {
      throw new ApiError(403, "permission-denied", "Faqat dastavchik buyurtmani yetkaza oladi");
    }

    const { orderId, itemIds, paidAmount, kind, note, actorName } = req.body ?? {};
    if (!orderId || !Array.isArray(itemIds) || itemIds.length === 0) {
      throw new ApiError(400, "invalid-argument", "orderId va kamida bitta mahsulot kerak");
    }
    if (typeof paidAmount !== "number" || !Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new ApiError(400, "invalid-argument", "Mijozdan olingan summani kiriting");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const paymentRef = db.collection("payments").doc();
    const now = new Date();
    const dateKey = businessDateString(now);

    let result: { orderNumber: number; dueAmount: number; shortfall: number; kind: PaymentKind } | null = null;

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
      const dueAmount = prices.reduce((sum, p) => sum + p, 0);
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
      const deliveredIds = new Set(targets.map((d) => d.id));
      const remainingItemCount = itemsSnap.docs.filter(
        (d) => !deliveredIds.has(d.id) && d.data().status !== "done",
      ).length;

      const orderNumber = (order.orderNumber as number) ?? 0;
      const customerName = (order.customerName as string) ?? "";
      const phone = (order.phone as string) ?? "";

      targets.forEach((doc, i) => {
        const item = doc.data();
        tx.update(doc.ref, {
          status: "done",
          deliveredBy: employeeId,
          deliveredAt: Timestamp.fromDate(now),
          collectedAmount: shares[i],
          updatedAt: FieldValue.serverTimestamp(),
          ...(typeof actorName === "string" && actorName.trim() ? { deliveredByName: actorName.trim() } : {}),
        });

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
        });
      });

      const orderUpdate: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        deliveredByEmployees: FieldValue.arrayUnion(employeeId),
      };

      if (remainingItemCount === 0 && order.status !== "done") {
        orderUpdate.status = "done";
        orderUpdate.doneAt = FieldValue.serverTimestamp();
        orderUpdate.deliveredBy = employeeId;
        tx.set(orderRef.collection("statusHistory").doc(), {
          fromStatus: order.status,
          toStatus: "done",
          changedBy: employeeId,
          changedAt: FieldValue.serverTimestamp(),
          note: "Barcha mahsulotlar yetkazildi",
        });
      }

      const summaryItems: SummaryItemInput[] = itemsSnap.docs.map((d) =>
        deliveredIds.has(d.id)
          ? { ...(d.data() as SummaryItemInput), status: "done" }
          : (d.data() as SummaryItemInput),
      );
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
        paidAmount: Math.round(paidAmount),
        shortfall,
        kind: resolvedKind,
        // Chegirma va to'liq to'lov bo'yicha olinadigan narsa qolmaydi.
        settled: resolvedKind === "full" || resolvedKind === "discount",
        settledAt: null,
        settledBy: null,
        settledAmount: 0,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
      });

      result = { orderNumber, dueAmount: Math.round(dueAmount), shortfall, kind: resolvedKind };
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
    const { paymentId, amount, note } = req.body ?? {};
    if (!paymentId) throw new ApiError(400, "invalid-argument", "paymentId majburiy");

    const ref = db.collection("payments").doc(paymentId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new ApiError(404, "not-found", "To'lov yozuvi topilmadi");
      const payment = snap.data()!;

      if (role !== "admin" && payment.employeeId !== employeeId) {
        throw new ApiError(403, "permission-denied", "Bu yozuvni faqat uni qayd etgan xodim yoki admin yopa oladi");
      }
      if (payment.settled === true) {
        throw new ApiError(412, "failed-precondition", "Bu yozuv allaqachon yopilgan");
      }

      const shortfall = (payment.shortfall as number | undefined) ?? 0;
      const settledAmount = typeof amount === "number" && amount > 0 ? Math.round(amount) : shortfall;

      tx.update(ref, {
        settled: true,
        settledAt: Timestamp.fromDate(new Date()),
        settledBy: employeeId,
        settledAmount,
        settledNote: typeof note === "string" && note.trim() ? note.trim() : null,
      });
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
  shortfall: number;
  kind: PaymentKind;
  settled: boolean;
  settledAt: string | null;
  settledByName: string | null;
  settledAmount: number;
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
    paidAmount: (p.paidAmount as number | undefined) ?? 0,
    shortfall: (p.shortfall as number | undefined) ?? 0,
    kind: (p.kind as PaymentKind) ?? "full",
    settled: p.settled === true,
    settledAt: toIso(p.settledAt),
    settledByName: settledBy ? (names.get(settledBy) ?? "Noma'lum") : null,
    settledAmount: (p.settledAmount as number | undefined) ?? 0,
    note: (p.note as string | null) ?? null,
  };
}

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

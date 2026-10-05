import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc, parseDateKey } from "../lib/businessTime";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "../lib/orderSummary";
import { cashPartOf } from "../lib/dailyActivity";
import { loadEmployeeExpenses } from "../lib/expenses";
import { loadEmployeeNames } from "../lib/employeeNames";

export const statsRouter = Router();

/**
 * Buyurtmaning YAKUNLANMAGAN (faol) holatlari — `done`dan boshqa hammasi.
 * Eski buyurtmalarda order-darajasida qolgan holatlar ham (`washing`,
 * `ready` va h.k., item-darajasiga ko'chirilishidan oldingi) qamrab
 * olinadi, shuning uchun ro'yxat ataylab keng.
 */
const ACTIVE_ORDER_STATUSES = [
  "new",
  "picked_up",
  "brought_in",
  "washing",
  "packing",
  "qc_review",
  "ready",
  "team_assigned",
  "in_progress",
];

/** Joriy holat uchun o'qiladigan faol buyurtmalar chegarasi (himoya klapani). */
const MAX_ORDERS_SCANNED = 600;

/** Ko'rsatishga tayyor birlik nomlari — mobil ilova shuni to'g'ridan-to'g'ri chiqaradi. */
const UNIT_LABELS: Record<string, string> = {
  sqm: "m²",
  meter: "metr",
  kg: "kg",
  dona: "dona",
};

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

/**
 * Xodimning "Kunlik ko'rsatkichlar" paneli — bugungi sex/yuvish/yetkazish
 * ko'rsatkichlari, dastavchiklar qo'lidagi summa, va joriy holat
 * (yuvilmoqda / yetgazishga tayyor / o'lchanmagan).
 *
 * Faqat admin alohida `canViewStats` vakolatini bergan xodimlar (va
 * adminning o'zi) ko'ra oladi.
 *
 * UCHTA so'rov, mahsulotlarni umuman o'qimasdan:
 *
 *  1. Bugungi bosqichlar (yuvildi / yetkazildi / pul) — `dailyActivity`
 *     jurnalidan (lib/dailyActivity.ts). Avval bugun tegilgan HAR BIR
 *     buyurtmaning `items` pastki jamlanmasi o'qilardi; bandroq kunda bu
 *     bitta chaqiruvda yuzlab o'qish edi. Jurnal bir kun = bitta so'rov.
 *  2. Sexga kelish — `pickedUpAt` oralig'i bo'yicha to'g'ridan-to'g'ri.
 *  3. Joriy holat — faol buyurtmalardagi hosila maydonlardan.
 *
 * Admin panelidagi "Kunlik ko'rsatkichlar" ham AYNAN shu manbalardan
 * hisoblaydi (routes/dailyReport.ts), shuning uchun ilovadagi va
 * paneldagi raqamlar hech qachon bir-biriga qarama-qarshi chiqmaydi.
 */
statsRouter.post("/employeeDailyStats", withAuth, async (req: AuthedRequest, res) => {
  try {
    const role = req.auth!.role;
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;

    if (role !== "admin") {
      const empSnap = await db.collection("employees").doc(employeeId).get();
      if (empSnap.data()?.canViewStats !== true) {
        throw new ApiError(403, "permission-denied", "Ko'rsatkichlarni ko'rish huquqingiz yo'q");
      }
    }

    // Istalgan kun (talab): yuqoridagi kalendar orqali. Berilmasa — bugun.
    const dateKey = parseDateKey(req.body?.date);
    if (!dateKey) throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
    const isToday = dateKey === businessDateString(new Date());
    const range = businessDayRangeUtc(dateKey)!;

    const [activeSnap, intakeSnap, eventsSnap, expenses] = await Promise.all([
      // "Joriy holat" (hozir yuvilmoqda, tayyor, o'lchanmagan) faqat BUGUN
      // uchun ma'noli — o'tgan kunda u holat saqlanmagan. Boshqa kunda bu
      // og'ir so'rov umuman bajarilmaydi.
      isToday
        ? db.collection("orders").where("status", "in", ACTIVE_ORDER_STATUSES).limit(MAX_ORDERS_SCANNED).get()
        : Promise.resolve(null),
      db
        .collection("orders")
        .where("pickedUpAt", ">=", Timestamp.fromDate(range.start))
        .where("pickedUpAt", "<", Timestamp.fromDate(range.end))
        .get(),
      db.collection("dailyActivity").doc(dateKey).collection("events").get(),
      loadEmployeeExpenses(dateKey),
    ]);

    // --- 1. Bugun sexga keldi ---
    const broughtInOrders = intakeSnap.docs
      .map((doc) => {
        const o = doc.data();
        return {
          orderId: doc.id,
          orderNumber: (o.orderNumber as number) ?? 0,
          customerName: (o.customerName as string) ?? "",
          phone: (o.phone as string) ?? "",
          itemCount: (o.itemCount as number | undefined) ?? 0,
          at: toIso(o.pickedUpAt),
        };
      })
      .sort((a, b) => b.orderNumber - a.orderNumber);

    // --- 2. Bugungi bosqichlar (jurnaldan) ---
    const washedItems: Record<string, unknown>[] = [];
    const washedTotals = new Map<string, number>();
    const deliveredOrderIds = new Map<string, Record<string, unknown>>();
    const cashEntries: Record<string, unknown>[] = [];
    let cashTotal = 0;

    for (const doc of eventsSnap.docs) {
      const e = doc.data();
      const type = e.type as string;
      const base = {
        orderId: (e.orderId as string) ?? "",
        orderNumber: (e.orderNumber as number) ?? 0,
        customerName: (e.customerName as string) ?? "",
        phone: (e.phone as string) ?? "",
      };

      if (type === "washed") {
        const calcType = (e.calcType as string | null) ?? null;
        washedItems.push({
          ...base,
          itemId: (e.itemId as string | null) ?? null,
          itemName: (e.itemName as string) ?? "Mahsulot",
          calcType,
          qty: (e.qty as number | null) ?? null,
          price: (e.price as number | undefined) ?? 0,
          at: toIso(e.at),
        });
        const unit = UNIT_LABELS[UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona"] ?? "dona";
        washedTotals.set(unit, (washedTotals.get(unit) ?? 0) + unitAmountOf(calcType, e.qty as number | null));
      }

      // Boshqa kuni qolgan qarz BUGUN yopilgan bo'lsa, pul bugun
      // olingan. Admin panelidagi kunlik kassa ham aynan shu qoida
      // bo'yicha hisoblaydi — ikki joyda ikki xil raqam chiqmasligi
      // uchun shart.
      //
      // Topshiriladigan — faqat NAQD qism (admin paneli bilan bir xil):
      // karta puli to'g'ridan-to'g'ri kompaniya hisobiga tushadi.
      if (type === "settled" || type === "prepaid") {
        const amount = cashPartOf({ ...e, price: 0 });
        if (amount > 0) {
          cashTotal += amount;
          cashEntries.push({
            ...base,
            amount,
            itemName: type === "settled" ? "Yopilgan qarz" : "Oldindan to'lov",
            at: toIso(e.at),
          });
        }
      }

      if (type === "delivered" || type === "onsite_done") {
        deliveredOrderIds.set(base.orderId, {
          ...base,
          serviceType: (e.serviceType as string) ?? "pickup",
        });
        // Talab: dastavchik yetkazgach buyurtma summasini mijozdan oladi
        // — ya'ni qo'lda alohida summa kiritilmagan bo'lsa ham pul unda.
        // Shu sabab qiymat `collectedAmount ?? price` (naqd qismi), va
        // admin panelidagi hisob bilan bir xil.
        const amount = cashPartOf(e);
        if (amount > 0) {
          cashTotal += amount;
          cashEntries.push({
            ...base,
            amount,
            itemName: (e.itemName as string) ?? "Mahsulot",
            at: toIso(e.at),
          });
        }
      }
    }

    // Xodimlar qo'lidagi naqddan qilgan chiqimlar (yoqilg'i va h.k.)
    // topshiriladigan summani kamaytiradi.
    const cashExpenses = expenses.filter((x) => x.fromCash);
    if (cashExpenses.length > 0) {
      const names = await loadEmployeeNames();
      for (const x of cashExpenses) {
        cashTotal -= x.amount;
        cashEntries.push({
          orderId: "",
          orderNumber: 0,
          customerName: names.get(x.employeeId) ?? "Xodim",
          phone: "",
          amount: -x.amount,
          itemName: `Chiqim · ${x.name}`,
          at: x.at,
        });
      }
    }

    // --- 3. Joriy holat (faol buyurtmalardagi hosila maydonlardan) ---
    const washingOrders: Record<string, unknown>[] = [];
    const readyOrders: Record<string, unknown>[] = [];
    const unmeasuredOrders: Record<string, unknown>[] = [];
    let washingItemCount = 0;
    let readyItemCount = 0;

    for (const doc of activeSnap?.docs ?? []) {
      const order = doc.data();
      const counts = (order.itemStatusCounts as Record<string, number> | undefined) ?? {};
      const base = {
        orderId: doc.id,
        orderNumber: (order.orderNumber as number) ?? 0,
        customerName: (order.customerName as string) ?? "",
        phone: (order.phone as string) ?? "",
      };

      const washing = counts.washing ?? 0;
      if (washing > 0) {
        washingItemCount += washing;
        washingOrders.push({ ...base, itemCount: washing });
      }
      const ready = counts.ready ?? 0;
      if (ready > 0) {
        readyItemCount += ready;
        readyOrders.push({ ...base, itemCount: ready });
      }
      const zeroPrice = (order.zeroPriceItemCount as number | undefined) ?? 0;
      if (zeroPrice > 0) unmeasuredOrders.push({ ...base, unmeasuredCount: zeroPrice });
    }

    const byNumberDesc = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((b.orderNumber as number) ?? 0) - ((a.orderNumber as number) ?? 0);

    const deliveredOrders = [...deliveredOrderIds.values()].sort(byNumberDesc);

    res.json({
      date: dateKey,
      isToday,
      broughtInToday: { count: broughtInOrders.length, orders: broughtInOrders },
      washedToday: {
        count: washedItems.length,
        totals: [...washedTotals.entries()].map(([unit, amount]) => ({
          unit,
          amount: Math.round(amount * 100) / 100,
        })),
        items: washedItems,
      },
      deliveredToday: { count: deliveredOrders.length, orders: deliveredOrders },
      cashToHandOver: { total: Math.round(cashTotal), entries: cashEntries },
      // `count` — mahsulotlar soni (yuvish/tayyorlik ITEM darajasida
      // kechadi), `orderCount` — shu mahsulotlar tegishli bo'lgan
      // buyurtmalar soni.
      washingNow: { count: washingItemCount, orderCount: washingOrders.length, orders: washingOrders.sort(byNumberDesc) },
      readyToDeliver: { count: readyItemCount, orderCount: readyOrders.length, orders: readyOrders.sort(byNumberDesc) },
      unmeasured: { count: unmeasuredOrders.length, orders: unmeasuredOrders.sort(byNumberDesc) },
    });
  } catch (err) {
    sendError(res, err);
  }
});

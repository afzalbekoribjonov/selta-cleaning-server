import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import { businessDayStartUtc, businessDateString } from "../lib/businessTime";

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

/** Hisoblash uchun o'qiladigan buyurtmalar soni chegarasi (himoya klapani). */
const MAX_ORDERS_SCANNED = 600;

const UNIT_LABELS: Record<string, string> = {
  sqm: "m²",
  meter: "metr",
  kg: "kg",
  count: "dona",
  size: "dona",
  fixed: "dona",
};

interface ItemRow {
  orderId: string;
  orderNumber: number;
  customerName: string;
  itemId: string;
  itemName: string;
  calcType: string;
  qty: number;
  price: number;
  at: string | null;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

/**
 * Xodimning "Kunlik ko'rsatkichlar" paneli (talab) — bugungi sex/yuvish/
 * yetkazish ko'rsatkichlari, dastavchiklar topshirishi kerak bo'lgan
 * summa, va joriy holat (yuvilmoqda / yetgazishga tayyor / o'lchanmagan).
 *
 * Faqat admin alohida `canViewStats` vakolatini bergan xodimlar (va
 * adminning o'zi) ko'ra oladi.
 *
 * Ma'lumot manbai: buyurtmalar + ularning `items` pastki jamlanmasi.
 * Collection-group so'rov ATAYLAB ishlatilmadi — u `items` uchun alohida
 * collection-group indeks va xavfsizlik qoidasi talab qilardi; buning
 * o'rniga faqat KERAKLI buyurtmalar (faol + bugun o'zgargan) o'qiladi va
 * ularning itemlari parallel olinadi. Har qanday item harakati
 * (`changeItemStatus`) buyurtmaning `updatedAt`ini ham yangilaydi, shuning
 * uchun "bugun yuvilgan/yetkazilgan" itemlar shu oynadan hech qachon
 * tushib qolmaydi.
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

    const now = new Date();
    const dayStart = Timestamp.fromDate(businessDayStartUtc(now));

    // Faol buyurtmalar (joriy holat ko'rsatkichlari uchun) + bugun
    // o'zgargan buyurtmalar (bugungi harakatlar uchun). Ikkalasi ham
    // bitta maydonli so'rov — qo'shimcha composite indeks talab qilmaydi.
    const [activeSnap, touchedSnap] = await Promise.all([
      db.collection("orders").where("status", "in", ACTIVE_ORDER_STATUSES).limit(MAX_ORDERS_SCANNED).get(),
      db.collection("orders").where("updatedAt", ">=", dayStart).limit(MAX_ORDERS_SCANNED).get(),
    ]);

    const orderDocs = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of [...activeSnap.docs, ...touchedSnap.docs]) {
      orderDocs.set(doc.id, doc.data());
    }

    // Har bir buyurtmaning itemlari alohida so'rov bilan olinadi. Bu N ta
    // so'rov degani, shuning uchun N qat'iy cheklanadi — normal ish
    // hajmida (o'nlab faol buyurtma) bu chegaraga hech qachon yetilmaydi,
    // u faqat kutilmagan holatda serverni himoya qilish uchun.
    const orderIds = [...orderDocs.keys()].slice(0, MAX_ORDERS_SCANNED);
    const itemsByOrder = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    await Promise.all(
      orderIds.map(async (id) => {
        const snap = await db.collection("orders").doc(id).collection("items").get();
        itemsByOrder.set(id, snap.docs);
      }),
    );
    // Itemlari o'qilmagan buyurtmalar hisob-kitobdan chiqariladi (yarim
    // ma'lumot bilan noto'g'ri son ko'rsatgandan ko'ra, umuman
    // ko'rsatmagan ma'qul).
    for (const id of [...orderDocs.keys()]) {
      if (!itemsByOrder.has(id)) orderDocs.delete(id);
    }

    const broughtInOrders: Record<string, unknown>[] = [];
    const deliveredOrders: Record<string, unknown>[] = [];
    const washedItems: ItemRow[] = [];
    const washingItems: ItemRow[] = [];
    const readyItems: ItemRow[] = [];
    const unmeasuredOrders: Record<string, unknown>[] = [];
    const cashEntries: Record<string, unknown>[] = [];

    const washedTotals = new Map<string, number>();
    let cashTotal = 0;

    for (const [orderId, order] of orderDocs) {
      const orderNumber = (order.orderNumber as number) ?? 0;
      const customerName = (order.customerName as string) ?? "";
      const phone = (order.phone as string) ?? "";
      const serviceType = (order.serviceType as string) ?? "pickup";
      const items = itemsByOrder.get(orderId) ?? [];

      const base = { orderId, orderNumber, customerName, phone };

      // 1) Bugun sexga keldi — dastavchik olib kelgan (pickup) buyurtmalar.
      const pickedUpAt = toDate(order.pickedUpAt);
      if (pickedUpAt && pickedUpAt >= dayStart.toDate()) {
        broughtInOrders.push({ ...base, at: pickedUpAt.toISOString() });
      }

      // 2) Joyida yuvish buyurtmasi bugun yakunlangan bo'lsa — u ham
      // "bugun yetgazildi"ga kiradi (item-darajasi onsite'da yo'q).
      const doneAt = toDate(order.doneAt);
      if (serviceType === "onsite" && doneAt && doneAt >= dayStart.toDate()) {
        deliveredOrders.push({ ...base, at: doneAt.toISOString(), serviceType });
        const collected = (order.collectedAmount as number | undefined) ?? 0;
        if (collected > 0) {
          cashTotal += collected;
          cashEntries.push({ ...base, amount: collected, at: doneAt.toISOString() });
        }
      }

      let orderDeliveredToday = false;
      let unmeasuredCount = 0;

      for (const itemDoc of items) {
        const item = itemDoc.data();
        const calcType = (item.calcType as string) ?? "fixed";
        const qty = (item.qty as number | undefined) ?? 0;
        const price = (item.price as number | undefined) ?? 0;
        const status = (item.status as string | undefined) ?? null;
        const row: ItemRow = {
          orderId,
          orderNumber,
          customerName,
          itemId: itemDoc.id,
          itemName: (item.name as string) ?? "Mahsulot",
          calcType,
          qty,
          price,
          at: null,
        };

        const washedAt = toDate(item.washedAt);
        if (washedAt && washedAt >= dayStart.toDate()) {
          washedItems.push({ ...row, at: washedAt.toISOString() });
          // O'lchovli turlar o'z birligida yig'iladi, o'lchovsizlar donada.
          const unit = UNIT_LABELS[calcType] ?? "dona";
          const amount = calcType === "sqm" || calcType === "meter" || calcType === "kg" ? qty : 1;
          washedTotals.set(unit, (washedTotals.get(unit) ?? 0) + amount);
        }

        const deliveredAt = toDate(item.deliveredAt);
        if (deliveredAt && deliveredAt >= dayStart.toDate()) {
          orderDeliveredToday = true;
          const collected = (item.collectedAmount as number | undefined) ?? 0;
          if (collected > 0) {
            cashTotal += collected;
            cashEntries.push({ ...base, amount: collected, at: deliveredAt.toISOString(), itemName: row.itemName });
          }
        }

        if (status === "washing") washingItems.push(row);
        if (status === "ready") readyItems.push(row);

        // O'lchanmagan — mahsulot mavjud, lekin narxi hali 0 (ishchi sexda
        // o'lchab kiritishi kerak). Yakunlangan itemlar hisobga olinmaydi.
        if (price <= 0 && status !== "done") unmeasuredCount += 1;
      }

      if (orderDeliveredToday) {
        deliveredOrders.push({ ...base, serviceType });
      }
      if (unmeasuredCount > 0) {
        unmeasuredOrders.push({ ...base, unmeasuredCount });
      }
    }

    const byNumberDesc = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((b.orderNumber as number) ?? 0) - ((a.orderNumber as number) ?? 0);

    res.json({
      date: businessDateString(now),
      broughtInToday: { count: broughtInOrders.length, orders: broughtInOrders.sort(byNumberDesc) },
      washedToday: {
        count: washedItems.length,
        totals: [...washedTotals.entries()].map(([unit, amount]) => ({
          unit,
          amount: Math.round(amount * 100) / 100,
        })),
        items: washedItems,
      },
      deliveredToday: { count: deliveredOrders.length, orders: deliveredOrders.sort(byNumberDesc) },
      cashToHandOver: { total: cashTotal, entries: cashEntries },
      washingNow: { count: washingItems.length, items: washingItems },
      readyToDeliver: { count: readyItems.length, items: readyItems },
      unmeasured: { count: unmeasuredOrders.length, orders: unmeasuredOrders.sort(byNumberDesc) },
    });
  } catch (err) {
    sendError(res, err);
  }
});

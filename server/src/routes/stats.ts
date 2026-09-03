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

    // Itemlar FAQAT bugun o'zgargan buyurtmalar uchun o'qiladi.
    //
    // Avval BARCHA faol buyurtmalarning itemlari o'qilardi (N+1) — yuzlab
    // faol buyurtmada bu bitta chaqiruvda minglab o'qish edi va Firestore
    // kunlik limitini tugatishga hissa qo'shdi. "Bugun yuvildi/yetkazildi"
    // uchun faqat bugun tegilgan buyurtmalar kerak (har qanday item
    // harakati buyurtmaning `updatedAt`ini ham yangilaydi), joriy holat
    // ko'rsatkichlari esa endi buyurtmadagi hosila maydonlardan olinadi.
    const touchedIds = touchedSnap.docs.map((d) => d.id).slice(0, MAX_ORDERS_SCANNED);
    const itemsByOrder = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    await Promise.all(
      touchedIds.map(async (id) => {
        const snap = await db.collection("orders").doc(id).collection("items").get();
        itemsByOrder.set(id, snap.docs);
      }),
    );

    const broughtInOrders: Record<string, unknown>[] = [];
    const deliveredOrders: Record<string, unknown>[] = [];
    const washedItems: ItemRow[] = [];
    const cashEntries: Record<string, unknown>[] = [];
    const washedTotals = new Map<string, number>();
    let cashTotal = 0;

    // --- BUGUNGI harakatlar: faqat bugun tegilgan buyurtmalarning
    // itemlaridan (aniq vaqt shtampi kerak, hosila maydonda yo'q). ---
    for (const [orderId, order] of orderDocs) {
      const orderNumber = (order.orderNumber as number) ?? 0;
      const customerName = (order.customerName as string) ?? "";
      const phone = (order.phone as string) ?? "";
      const serviceType = (order.serviceType as string) ?? "pickup";
      const base = { orderId, orderNumber, customerName, phone };

      const pickedUpAt = toDate(order.pickedUpAt);
      if (pickedUpAt && pickedUpAt >= dayStart.toDate()) {
        broughtInOrders.push({ ...base, at: pickedUpAt.toISOString() });
      }

      // Joyida yuvish item-darajasiga ega emas — u order darajasida yopiladi.
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
      for (const itemDoc of itemsByOrder.get(orderId) ?? []) {
        const item = itemDoc.data();
        const calcType = (item.calcType as string) ?? "fixed";
        const qty = (item.qty as number | undefined) ?? 0;
        const row: ItemRow = {
          orderId,
          orderNumber,
          customerName,
          itemId: itemDoc.id,
          itemName: (item.name as string) ?? "Mahsulot",
          calcType,
          qty,
          price: (item.price as number | undefined) ?? 0,
          at: null,
        };

        const washedAt = toDate(item.washedAt);
        if (washedAt && washedAt >= dayStart.toDate()) {
          washedItems.push({ ...row, at: washedAt.toISOString() });
          // O'lchovli turlar o'z birligida yig'iladi, o'lchovsizlar donada.
          const unit = UNIT_LABELS[calcType] ?? "dona";
          washedTotals.set(unit, (washedTotals.get(unit) ?? 0) + (calcType === "sqm" || calcType === "meter" || calcType === "kg" ? qty : 1));
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
      }
      if (orderDeliveredToday) deliveredOrders.push({ ...base, serviceType });
    }

    // --- JORIY holat: buyurtmadagi hosila maydonlardan (itemlarni
    // umuman o'qimasdan). Ro'yxatlar mahsulot emas, BUYURTMA darajasida
    // beriladi — bu ham yetarli darajada foydali, lekin arzon. ---
    const washingOrders: Record<string, unknown>[] = [];
    const readyOrders: Record<string, unknown>[] = [];
    const unmeasuredOrders: Record<string, unknown>[] = [];
    let washingItemCount = 0;
    let readyItemCount = 0;

    for (const doc of activeSnap.docs) {
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

    res.json({
      date: businessDateString(now),
      broughtInToday: { count: broughtInOrders.length, orders: broughtInOrders.sort(byNumberDesc) },
      washedToday: {
        count: washedItems.length,
        totals: [...washedTotals.entries()].map(([unit, amount]) => ({ unit, amount: Math.round(amount * 100) / 100 })),
        items: washedItems,
      },
      deliveredToday: { count: deliveredOrders.length, orders: deliveredOrders.sort(byNumberDesc) },
      cashToHandOver: { total: cashTotal, entries: cashEntries },
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

import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc } from "../lib/businessTime";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "../lib/orderSummary";

/**
 * Admin panelining "Kunlik ko'rsatkichlar" bo'limi — istalgan kun uchun:
 * sexga nima keldi, nima yuvildi, nima upakovka qilindi, nima yetkazildi,
 * va qaysi dastavchik qo'lida qancha pul bor.
 *
 * MA'LUMOT MANBAI ikkita, va bu ataylab:
 *
 *  - Bosqichlar (yuvildi / upakovka / yetkazildi) — `dailyActivity`
 *    jurnalidan (lib/dailyActivity.ts). Bir kun = bitta jamlanma so'rovi,
 *    o'zgarmas, istalgan o'tgan kun uchun ishlaydi.
 *
 *  - Sexga kelish — buyurtmalarning `pickedUpAt` maydonidan. Jurnal
 *    EMAS, chunki buyurtma sexga kelganda mahsulotlari hali
 *    o'lchanmagan bo'ladi: hajm kun davomida, ishchi o'lchagan sari
 *    aniqlashishi kerak. O'zgarmas hodisa buni muzlatib qo'yardi.
 */
export const dailyReportRouter = Router();

const UNIT_LABELS: Record<string, string> = {
  sqm: "m²",
  meter: "metr",
  kg: "kg",
  dona: "dona",
};

const UNIT_ORDER = ["sqm", "meter", "kg", "dona"];

interface UnitTotal {
  unit: string;
  label: string;
  amount: number;
}

/** { sqm: 12.5, dona: 3 } -> [{ unit, label, amount }] — ko'rsatish uchun tayyor. */
function toUnitTotals(map: Map<string, number>): UnitTotal[] {
  return [...map.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => UNIT_ORDER.indexOf(a[0]) - UNIT_ORDER.indexOf(b[0]))
    .map(([unit, amount]) => ({ unit, label: UNIT_LABELS[unit] ?? unit, amount: Math.round(amount * 100) / 100 }));
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

/** Kun kalitini tekshiradi; berilmasa bugungi biznes kuni qaytariladi. */
function resolveDateKey(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return businessDateString(new Date());
  const dateKey = String(raw);
  if (!businessDayRangeUtc(dateKey)) {
    throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
  }
  return dateKey;
}

/**
 * employeeId -> to'liq ism.
 *
 * Qisqa muddatli keshda: hisobot paneli har ochilganda butun `employees`
 * jamlanmasini qayta o'qishning ma'nosi yo'q — ismlar deyarli
 * o'zgarmaydi. Eng yomon holatda yangi qo'shilgan xodim ismi bir necha
 * daqiqa "Noma'lum" ko'rinadi, keyin o'z-o'zidan to'g'rilanadi.
 */
const EMPLOYEE_NAME_TTL_MS = 5 * 60_000;
let employeeNameCache: { at: number; names: Map<string, string> } | null = null;

async function loadEmployeeNames(): Promise<Map<string, string>> {
  if (employeeNameCache && Date.now() - employeeNameCache.at < EMPLOYEE_NAME_TTL_MS) {
    return employeeNameCache.names;
  }
  const snap = await db.collection("employees").get();
  const names = new Map(snap.docs.map((d) => [d.id, (d.data().fullName as string) ?? "Noma'lum"]));
  employeeNameCache = { at: Date.now(), names };
  return names;
}

interface ActivityRow {
  id: string;
  at: string | null;
  orderId: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  itemId: string | null;
  itemNumber: number | null;
  itemName: string;
  unit: string;
  unitLabel: string;
  /** O'lchovli turda haqiqiy hajm, o'lchovsizda 1 (dona). */
  unitAmount: number;
  qty: number | null;
  price: number;
  employeeId: string;
  employeeName: string;
  collectedAmount: number | null;
}

dailyReportRouter.post("/adminDailyReport", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const dateKey = resolveDateKey(req.body?.date);
    const range = businessDayRangeUtc(dateKey)!;

    const [eventsSnap, intakeSnap, employeeNames, handoverSnap] = await Promise.all([
      db.collection("dailyActivity").doc(dateKey).collection("events").get(),
      db
        .collection("orders")
        .where("pickedUpAt", ">=", Timestamp.fromDate(range.start))
        .where("pickedUpAt", "<", Timestamp.fromDate(range.end))
        .get(),
      loadEmployeeNames(),
      db.collection("cashHandovers").doc(dateKey).get(),
    ]);

    // --- Bosqich hodisalari ---
    const rowsByType: Record<string, ActivityRow[]> = { washed: [], packed: [], delivered: [], onsite_done: [] };

    for (const doc of eventsSnap.docs) {
      const e = doc.data();
      const type = (e.type as string) ?? "";
      if (!(type in rowsByType)) continue;
      const calcType = (e.calcType as string | null) ?? null;
      const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
      const employeeId = (e.employeeId as string) ?? "";
      rowsByType[type].push({
        id: doc.id,
        at: toIso(e.at),
        orderId: (e.orderId as string) ?? "",
        orderNumber: (e.orderNumber as number) ?? 0,
        customerName: (e.customerName as string) ?? "",
        phone: (e.phone as string) ?? "",
        itemId: (e.itemId as string | null) ?? null,
        itemNumber: (e.itemNumber as number | null) ?? null,
        itemName: (e.itemName as string) ?? "Mahsulot",
        unit,
        unitLabel: UNIT_LABELS[unit] ?? unit,
        unitAmount: unitAmountOf(calcType, e.qty as number | null),
        qty: (e.qty as number | null) ?? null,
        price: (e.price as number | undefined) ?? 0,
        employeeId,
        employeeName: employeeNames.get(employeeId) ?? "Noma'lum",
        collectedAmount: (e.collectedAmount as number | null) ?? null,
      });
    }

    const byTimeDesc = (a: ActivityRow, b: ActivityRow) => (b.at ?? "").localeCompare(a.at ?? "");
    for (const rows of Object.values(rowsByType)) rows.sort(byTimeDesc);

    /** Bosqich xulosasi: nechta mahsulot, nechta buyurtma, birlik bo'yicha hajm. */
    function summarize(rows: ActivityRow[]) {
      const units = new Map<string, number>();
      for (const r of rows) units.set(r.unit, (units.get(r.unit) ?? 0) + r.unitAmount);
      return {
        count: rows.length,
        orderCount: new Set(rows.map((r) => r.orderId)).size,
        totals: toUnitTotals(units),
        totalPrice: Math.round(rows.reduce((sum, r) => sum + r.price, 0)),
        rows,
      };
    }

    // Yetkazish — mahsulot bo'yicha (pickup) va butun buyurtma bo'yicha
    // (joyida yuvish) hodisalari birga, chunki ikkalasi ham "mijozga
    // topshirildi" degani va ikkalasida ham dastavchik pul oladi.
    const deliveredRows = [...rowsByType.delivered, ...rowsByType.onsite_done].sort(byTimeDesc);

    // --- Dastavchiklar qo'lidagi pul ---
    // Talab: dastavchik buyurtmani yetkazgach, uning summasini mijozdan
    // oladi — ya'ni pul kun oxirida shu dastavchikda bo'ladi. Qo'lda
    // kiritilgan summa (`collectedAmount`) bo'lsa u ustun, aks holda
    // mahsulot/buyurtma narxi. Raqam HAR KUNI yangidan boshlanadi.
    const driverMap = new Map<
      string,
      { employeeId: string; name: string; amount: number; itemCount: number; orderIds: Set<string> }
    >();
    for (const r of deliveredRows) {
      const entry = driverMap.get(r.employeeId) ?? {
        employeeId: r.employeeId,
        name: r.employeeName,
        amount: 0,
        itemCount: 0,
        orderIds: new Set<string>(),
      };
      entry.amount += r.collectedAmount ?? r.price;
      entry.itemCount += 1;
      entry.orderIds.add(r.orderId);
      driverMap.set(r.employeeId, entry);
    }

    const handedOver =
      (handoverSnap.data()?.handedOver as Record<string, { amount?: number; at?: Timestamp; by?: string }> | undefined) ?? {};
    const drivers = [...driverMap.values()]
      .map((d) => ({
        employeeId: d.employeeId,
        name: d.name,
        amount: Math.round(d.amount),
        itemCount: d.itemCount,
        orderCount: d.orderIds.size,
        handedOver: handedOver[d.employeeId] !== undefined,
        handedOverAmount: handedOver[d.employeeId]?.amount ?? null,
        handedOverAt: toIso(handedOver[d.employeeId]?.at),
      }))
      .sort((a, b) => b.amount - a.amount);

    // --- Sexga kelish ---
    const intakeUnits = new Map<string, number>();
    let intakeItemCount = 0;
    let intakeUnmeasured = 0;
    const intakeOrders = intakeSnap.docs
      .map((doc) => {
        const o = doc.data();
        const unitTotals = (o.itemUnitTotals as Record<string, number> | undefined) ?? null;
        const itemCount = (o.itemCount as number | undefined) ?? 0;
        const orderUnits = new Map<string, number>();
        if (unitTotals) {
          for (const [unit, amount] of Object.entries(unitTotals)) {
            orderUnits.set(unit, amount);
            intakeUnits.set(unit, (intakeUnits.get(unit) ?? 0) + amount);
          }
        }
        intakeItemCount += itemCount;
        const zeroPrice = (o.zeroPriceItemCount as number | undefined) ?? 0;
        intakeUnmeasured += zeroPrice;
        const pickedUpBy = (o.pickedUpBy as string | undefined) ?? "";
        return {
          orderId: doc.id,
          orderNumber: (o.orderNumber as number) ?? 0,
          customerName: (o.customerName as string) ?? "",
          phone: (o.phone as string) ?? "",
          location: (o.location as string) ?? "",
          at: toIso(o.pickedUpAt),
          itemCount,
          // Hosila maydon hali to'ldirilmagan eski buyurtmada `null` —
          // UI 0 ko'rsatish o'rniga "noma'lum" deb muomala qiladi.
          totals: unitTotals ? toUnitTotals(orderUnits) : null,
          totalPrice: (o.totalPrice as number | undefined) ?? 0,
          unmeasuredCount: zeroPrice,
          intakeMethod: (o.intakeMethod as string | null) ?? null,
          broughtInBy: pickedUpBy,
          broughtInByName: (o.pickedUpByName as string | undefined) ?? employeeNames.get(pickedUpBy) ?? "",
        };
      })
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

    res.json({
      date: dateKey,
      isToday: dateKey === businessDateString(new Date()),
      // Jurnal shu kun uchun bo'sh bo'lsa, bu haqiqatan ish bo'lmagani
      // yoki kun jurnal joriy etilishidan oldingi bo'lgani — UI shu
      // farqni ko'rsata olishi uchun.
      hasActivityLog: eventsSnap.size > 0,
      intake: {
        orderCount: intakeOrders.length,
        itemCount: intakeItemCount,
        unmeasuredCount: intakeUnmeasured,
        totals: toUnitTotals(intakeUnits),
        orders: intakeOrders,
      },
      washed: summarize(rowsByType.washed),
      packed: summarize(rowsByType.packed),
      delivered: {
        ...summarize(deliveredRows),
        // Yetkazishda "nechta buyurtma" asosiy ko'rsatkich (talab), shuning
        // uchun pul summasi ham alohida beriladi.
        deliveredAmount: Math.round(deliveredRows.reduce((s, r) => s + (r.collectedAmount ?? r.price), 0)),
      },
      drivers,
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Sexga kelgan buyurtmalarning MAHSULOTLARI — faqat admin "Ko'rish"
 * tugmasini bosganda chaqiriladi. Asosiy hisobot buyurtma darajasidagi
 * hosila hajmlar bilan kifoyalanadi, shuning uchun panelning har
 * ochilishida mahsulotlar o'qilmaydi.
 */
dailyReportRouter.post("/adminDailyIntakeItems", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const dateKey = resolveDateKey(req.body?.date);
    const range = businessDayRangeUtc(dateKey)!;

    const ordersSnap = await db
      .collection("orders")
      .where("pickedUpAt", ">=", Timestamp.fromDate(range.start))
      .where("pickedUpAt", "<", Timestamp.fromDate(range.end))
      .get();

    const perOrder = await Promise.all(
      ordersSnap.docs.map(async (doc) => {
        const o = doc.data();
        const itemsSnap = await doc.ref.collection("items").get();
        return itemsSnap.docs.map((itemDoc) => {
          const item = itemDoc.data();
          const calcType = (item.calcType as string | undefined) ?? null;
          const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
          return {
            orderId: doc.id,
            orderNumber: (o.orderNumber as number) ?? 0,
            customerName: (o.customerName as string) ?? "",
            phone: (o.phone as string) ?? "",
            at: toIso(o.pickedUpAt),
            itemId: itemDoc.id,
            itemNumber: (item.itemNumber as number | undefined) ?? null,
            itemName: (item.name as string) ?? "Mahsulot",
            status: (item.status as string | undefined) ?? null,
            tariff: (item.tariff as string | null) ?? null,
            unit,
            unitLabel: UNIT_LABELS[unit] ?? unit,
            unitAmount: unitAmountOf(calcType, item.qty as number | undefined),
            qty: (item.qty as number | undefined) ?? null,
            width: (item.width as number | undefined) ?? null,
            height: (item.height as number | undefined) ?? null,
            price: (item.price as number | undefined) ?? 0,
          };
        });
      }),
    );

    const rows = perOrder
      .flat()
      .sort((a, b) => b.orderNumber - a.orderNumber || (a.itemNumber ?? 0) - (b.itemNumber ?? 0));

    const units = new Map<string, number>();
    for (const r of rows) units.set(r.unit, (units.get(r.unit) ?? 0) + r.unitAmount);

    res.json({ date: dateKey, count: rows.length, totals: toUnitTotals(units), rows });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Dastavchik kunlik pulni kassaga topshirganini belgilaydi. Qoldiq
 * KUNDAN-KUNGA O'TMAYDI (talab) — bu faqat "shu kunning puli
 * topshirildi" degan belgi, kun bo'yicha bitta hujjatda saqlanadi.
 */
dailyReportRouter.post("/adminSetCashHandover", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const dateKey = resolveDateKey(req.body?.date);
    const { employeeId, handedOver, amount } = req.body ?? {};
    if (typeof employeeId !== "string" || !employeeId.trim()) {
      throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    }

    const ref = db.collection("cashHandovers").doc(dateKey);
    if (handedOver === false) {
      await ref.set({ handedOver: { [employeeId]: FieldValue.delete() } }, { merge: true });
    } else {
      await ref.set(
        {
          date: dateKey,
          handedOver: {
            [employeeId]: {
              amount: typeof amount === "number" ? Math.round(amount) : null,
              at: Timestamp.fromDate(new Date()),
              by: req.auth!.employeeId ?? req.auth!.uid,
            },
          },
        },
        { merge: true },
      );
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc } from "../lib/businessTime";
import { dailyActivityEvents } from "../lib/dailyActivity";
import { UNIT_BY_CALC_TYPE, unitAmountOf } from "../lib/orderSummary";
import { loadEmployeeNames } from "../lib/employeeNames";

/**
 * "Eng faol xodimlar" — boshqaruv panelidagi kunlik va maosh
 * sahifasidagi kunlik/haftalik/oylik ko'rinish uchun.
 *
 * NEGA SERVERDA: avval buni klient hisoblardi — oxirgi 150 buyurtmaning
 * HAR BIRIGA `items` pastki jamlanmasi uchun alohida onSnapshot ochib,
 * ya'ni bitta sahifa ochilishida yuzdan ortiq jonli obuna. Bu aynan
 * Firestore o'qish limitini tugatgan naqsh edi (lib/orderSummary.ts
 * izohiga qarang), faqat bu joyi e'tibordan chetda qolgan edi.
 *
 * Endi bosqich ko'rsatkichlari kunlik jurnaldan (bir kun = bitta
 * so'rov), buyurtma ko'rsatkichlari esa `createdAt`/`pickedUpAt`
 * oralig'idan olinadi. Mahsulotlar umuman o'qilmaydi.
 */
export const employeeActivityRouter = Router();

/** Bir so'rovda qamrab olinadigan maksimal kun (himoya klapani). */
const MAX_DAYS = 62;

export interface ActivityRow {
  employeeId: string;
  name: string;
  ordersCreated: number;
  ordersCreatedTotal: number;
  pickedUpCount: number;
  pickedUpTotal: number;
  deliveredCount: number;
  deliveredTotal: number;
  washedCount: number;
  packedCount: number;
}

/** "2026-09-01".."2026-09-05" -> ["2026-09-01", ..., "2026-09-05"] */
function dateKeysBetween(from: string, to: string): string[] {
  const start = businessDayRangeUtc(from);
  const end = businessDayRangeUtc(to);
  if (!start || !end || start.start > end.start) return [];
  const keys: string[] = [];
  // `start.start` allaqachon biznes yarim tunining UTC payti, shuning
  // uchun har bir qadam to'g'ridan-to'g'ri o'sha kunning kalitini beradi.
  for (let t = start.start.getTime(); t <= end.start.getTime() && keys.length < MAX_DAYS; t += 24 * 60 * 60_000) {
    keys.push(businessDateString(new Date(t)));
  }
  return keys;
}

employeeActivityRouter.post("/adminEmployeeActivity", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const today = businessDateString(new Date());
    const from = typeof req.body?.from === "string" && req.body.from ? req.body.from : today;
    const to = typeof req.body?.to === "string" && req.body.to ? req.body.to : today;

    const days = dateKeysBetween(from, to);
    if (days.length === 0) {
      throw new ApiError(400, "invalid-argument", "Sana oralig'i noto'g'ri");
    }

    const startUtc = businessDayRangeUtc(days[0])!.start;
    const endUtc = businessDayRangeUtc(days[days.length - 1])!.end;

    const [eventSnaps, createdSnap, pickedUpSnap, names] = await Promise.all([
      Promise.all(days.map((d) => dailyActivityEvents(d).get())),
      db
        .collection("orders")
        .where("createdAt", ">=", Timestamp.fromDate(startUtc))
        .where("createdAt", "<", Timestamp.fromDate(endUtc))
        .get(),
      db
        .collection("orders")
        .where("pickedUpAt", ">=", Timestamp.fromDate(startUtc))
        .where("pickedUpAt", "<", Timestamp.fromDate(endUtc))
        .get(),
      loadEmployeeNames(),
    ]);

    const rows = new Map<string, ActivityRow>();
    const ensure = (id: string): ActivityRow => {
      let row = rows.get(id);
      if (!row) {
        row = {
          employeeId: id,
          name: names.get(id) ?? "Noma'lum xodim",
          ordersCreated: 0,
          ordersCreatedTotal: 0,
          pickedUpCount: 0,
          pickedUpTotal: 0,
          deliveredCount: 0,
          deliveredTotal: 0,
          washedCount: 0,
          packedCount: 0,
        };
        rows.set(id, row);
      }
      return row;
    };

    for (const doc of createdSnap.docs) {
      const o = doc.data();
      const by = o.createdBy as string | undefined;
      if (!by) continue;
      const row = ensure(by);
      row.ordersCreated += 1;
      row.ordersCreatedTotal += (o.totalPrice as number | undefined) ?? 0;
    }

    for (const doc of pickedUpSnap.docs) {
      const o = doc.data();
      const by = o.pickedUpBy as string | undefined;
      if (!by) continue;
      const row = ensure(by);
      row.pickedUpCount += 1;
      row.pickedUpTotal += (o.totalPrice as number | undefined) ?? 0;
    }

    for (const snap of eventSnaps) {
      for (const doc of snap.docs) {
        const e = doc.data();
        const by = (e.employeeId as string | undefined) ?? "";
        if (!by) continue;
        const row = ensure(by);
        if (e.type === "washed") row.washedCount += 1;
        else if (e.type === "packed") row.packedCount += 1;
        else if (e.type === "delivered" || e.type === "onsite_done") {
          row.deliveredCount += 1;
          row.deliveredTotal += ((e.collectedAmount as number | null) ?? (e.price as number | undefined) ?? 0) as number;
        }
      }
    }

    res.json({ from: days[0], to: days[days.length - 1], rows: [...rows.values()] });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * XODIMNING O'ZI bajargan bugungi ish — ilovadagi profil sahifasi uchun.
 *
 * Har bir bo'lim o'ziga kerakli qismini oladi: dastavchik olib kelgan va
 * yetkazgan buyurtmalarini, ishchi yuvgan va upakovka qilgan
 * mahsulotlarini (birlik bo'yicha hajmi bilan), sotuv menejeri o'zi
 * ochgan buyurtmalarini.
 *
 * NEGA SERVERDA: avval ilova buni o'zi hisoblardi va har bir buyurtmaning
 * `items` pastki jamlanmasiga alohida obuna ochardi — profil sahifasini
 * ochish o'nlab jonli obunani ishga tushirardi. Bu yerda esa xodimning
 * O'Z hodisalari bitta so'rov bilan olinadi (`employeeId` bo'yicha
 * filtrlanadi, ya'ni boshqa xodimlarning yozuvlari umuman o'qilmaydi).
 *
 * Ro'yxatlar eng yangisi birinchi bo'lib qaytariladi.
 */
employeeActivityRouter.post("/myDailyActivity", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const dateKey = resolveDateKey(req.body?.date);
    const range = businessDayRangeUtc(dateKey)!;
    const start = Timestamp.fromDate(range.start);
    const end = Timestamp.fromDate(range.end);

    const [eventsSnap, pickedUpSnap, createdSnap, paymentsSnap] = await Promise.all([
      dailyActivityEvents(dateKey).where("employeeId", "==", employeeId).get(),
      db.collection("orders").where("pickedUpAt", ">=", start).where("pickedUpAt", "<", end).get(),
      db.collection("orders").where("createdAt", ">=", start).where("createdAt", "<", end).get(),
      db.collection("payments").where("dateKey", "==", dateKey).get(),
    ]);

    // --- Bosqich hodisalari (yuvildi / upakovka / yetkazildi) ---
    const washed: StageRow[] = [];
    const packed: StageRow[] = [];
    const delivered: StageRow[] = [];

    for (const doc of eventsSnap.docs) {
      const e = doc.data();
      const calcType = (e.calcType as string | null) ?? null;
      const unit = UNIT_BY_CALC_TYPE[calcType ?? "fixed"] ?? "dona";
      const row: StageRow = {
        id: doc.id,
        at: toIso(e.at),
        orderId: (e.orderId as string) ?? "",
        orderNumber: (e.orderNumber as number) ?? 0,
        customerName: (e.customerName as string) ?? "",
        itemName: (e.itemName as string) ?? "Mahsulot",
        itemNumber: (e.itemNumber as number | null) ?? null,
        unit,
        unitLabel: UNIT_LABELS[unit] ?? unit,
        unitAmount: unitAmountOf(calcType, e.qty as number | null),
        price: (e.price as number | undefined) ?? 0,
        collectedAmount: (e.collectedAmount as number | null) ?? null,
      };
      if (e.type === "washed") washed.push(row);
      else if (e.type === "packed") packed.push(row);
      else if (e.type === "delivered" || e.type === "onsite_done") delivered.push(row);
    }

    const newestFirst = (a: { at: string | null }, b: { at: string | null }) =>
      (b.at ?? "").localeCompare(a.at ?? "");
    washed.sort(newestFirst);
    packed.sort(newestFirst);
    delivered.sort(newestFirst);

    // --- Buyurtma darajasidagi ish ---
    const broughtIn = pickedUpSnap.docs
      .filter((d) => d.data().pickedUpBy === employeeId)
      .map((d) => toOrderRow(d, d.data().pickedUpAt))
      .sort(newestFirst);

    const created = createdSnap.docs
      .filter((d) => d.data().createdBy === employeeId)
      .map((d) => toOrderRow(d, d.data().createdAt))
      .sort(newestFirst);

    // --- To'lovlar ---
    const payments = paymentsSnap.docs
      .filter((d) => d.data().employeeId === employeeId)
      .map((d) => {
        const p = d.data();
        return {
          id: d.id,
          at: toIso(p.at),
          orderId: (p.orderId as string) ?? "",
          orderNumber: (p.orderNumber as number) ?? 0,
          customerName: (p.customerName as string) ?? "",
          phone: (p.phone as string) ?? "",
          dueAmount: (p.dueAmount as number | undefined) ?? 0,
          paidAmount: (p.paidAmount as number | undefined) ?? 0,
          shortfall: (p.shortfall as number | undefined) ?? 0,
          kind: (p.kind as string) ?? "full",
          settled: p.settled === true,
        };
      })
      .sort(newestFirst);

    const cash = payments.reduce((sum, p) => sum + p.paidAmount, 0);
    const byKind = (kind: string, onlyOpen: boolean) =>
      payments.filter((p) => p.kind === kind && (!onlyOpen || !p.settled));

    res.json({
      date: dateKey,
      broughtIn: {
        count: broughtIn.length,
        totalPrice: broughtIn.reduce((s, o) => s + o.totalPrice, 0),
        orders: broughtIn,
      },
      delivered: {
        count: delivered.length,
        orderCount: new Set(delivered.map((r) => r.orderId)).size,
        totalPrice: delivered.reduce((s, r) => s + r.price, 0),
        rows: delivered,
      },
      washed: { count: washed.length, totals: unitTotalsOf(washed), rows: washed },
      packed: { count: packed.length, totals: unitTotalsOf(packed), rows: packed },
      created: {
        count: created.length,
        totalPrice: created.reduce((s, o) => s + o.totalPrice, 0),
        orders: created,
      },
      payments: {
        cash,
        debt: sumShortfall(byKind("debt", true)),
        partial: sumShortfall(byKind("partial", true)),
        discount: sumShortfall(byKind("discount", false)),
        rows: payments,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

interface StageRow {
  id: string;
  at: string | null;
  orderId: string;
  orderNumber: number;
  customerName: string;
  itemName: string;
  itemNumber: number | null;
  unit: string;
  unitLabel: string;
  unitAmount: number;
  price: number;
  collectedAmount: number | null;
}

const UNIT_LABELS: Record<string, string> = { sqm: "m²", meter: "metr", kg: "kg", dona: "dona" };
const UNIT_ORDER = ["sqm", "meter", "kg", "dona"];

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

/** Kun kalitini tekshiradi; berilmasa bugungi biznes kuni. */
function resolveDateKey(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return businessDateString(new Date());
  const dateKey = String(raw);
  if (!businessDayRangeUtc(dateKey)) {
    throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
  }
  return dateKey;
}

function toOrderRow(doc: FirebaseFirestore.QueryDocumentSnapshot, at: unknown) {
  const o = doc.data();
  return {
    id: doc.id,
    at: toIso(at),
    orderNumber: (o.orderNumber as number) ?? 0,
    customerName: (o.customerName as string) ?? "",
    phone: (o.phone as string) ?? "",
    location: (o.location as string) ?? "",
    itemCount: (o.itemCount as number | undefined) ?? 0,
    totalPrice: (o.totalPrice as number | undefined) ?? 0,
    serviceType: (o.serviceType as string) ?? "pickup",
  };
}

/** Birlik bo'yicha jami hajm — har biri alohida ko'rsatiladi. */
function unitTotalsOf(rows: StageRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.unit, (map.get(r.unit) ?? 0) + r.unitAmount);
  return [...map.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => UNIT_ORDER.indexOf(a[0]) - UNIT_ORDER.indexOf(b[0]))
    .map(([unit, amount]) => ({ unit, label: UNIT_LABELS[unit] ?? unit, amount: Math.round(amount * 100) / 100 }));
}

function sumShortfall(rows: { shortfall: number }[]) {
  return { count: rows.length, amount: rows.reduce((s, r) => s + r.shortfall, 0) };
}

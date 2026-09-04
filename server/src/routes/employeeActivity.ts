import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc } from "../lib/businessTime";
import { dailyActivityEvents } from "../lib/dailyActivity";
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
  for (let t = start.start.getTime(); t <= end.start.getTime() && keys.length < MAX_DAYS; t += 24 * 60 * 60_000) {
    keys.push(businessDateString(new Date(t + 5 * 60 * 60_000)));
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

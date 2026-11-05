import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import { businessDateString, businessDayRangeUtc, parseDateKey } from "../lib/businessTime";
import { notifyEmployee, notifyLater } from "../lib/notifications";
import { BUILTIN_DEPARTMENT_LABELS, canManageWorkflow } from "../lib/roles";
import { buildDailyActivity, computeActivityRows, resolveDateKey } from "./employeeActivity";

/**
 * Nazoratchi (supervisor) amallari — ish jarayonini boshqarish.
 *
 * Mahsulot holatini boshqa xodim nomidan qayd etish `changeItemStatus`da
 * (`onBehalfOf`). Bu yerda:
 *  - xodimlar sharhi (bugungi ish, ogohlantirishlar, davomat);
 *  - bitta xodimning kunlik ishi (profil sahifasidagi bilan bir xil);
 *  - dastavchikka kunlik topshiriq (buyurtmalar va aniq mahsulotlar);
 *  - ogohlantirishlar.
 *
 * Topshiriq va ogohlantirish ATAYLAB mavjud hujjatlarga yoziladi
 * (buyurtma va xodim hujjati): ilovalar ularni allaqachon jonli o'qiydi,
 * shuning uchun dastavchik va xodim yangi o'qishlarsiz va yangi xavfsizlik
 * qoidalarisiz darhol ko'radi.
 */
export const supervisorRouter = Router();

/** Bitta topshiriqdagi buyurtmalar chegarasi (bitta tranzaksiya). */
const MAX_STOPS = 60;
/** Topshiriq qancha kun oldinga rejalashtirilishi mumkin. */
const MAX_DAYS_AHEAD = 14;
const MAX_WARNING_LENGTH = 500;
/** Xodim hujjatida saqlanadigan o'qilmagan ogohlantirishlar. */
const MAX_PENDING_WARNINGS = 10;

function requireSupervisor(req: AuthedRequest) {
  if (!canManageWorkflow(req.auth?.role)) {
    throw new ApiError(403, "permission-denied", "Bu bo'lim faqat nazoratchi uchun");
  }
  return req.auth!.employeeId ?? req.auth!.uid;
}

async function nameOf(employeeId: string, fallback = "Admin"): Promise<string> {
  const snap = await db.collection("employees").doc(employeeId).get();
  return (snap.data()?.fullName as string | undefined) ?? fallback;
}

/* ------------------------------------------------------------------ */
/* Xodimlar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Faol xodimlar ro'yxati va tanlangan kundagi ishi — nazoratchining
 * "Xodimlar" bo'limi va "kim yuvdi" tanlovi uchun (mutaxassislik va
 * upakovka huquqi bilan). Bir chaqiriqda: xodimlar + kunlik jurnal +
 * o'sha kungi davomat.
 */
supervisorRouter.post("/supervisorStaff", withAuth, async (req: AuthedRequest, res) => {
  try {
    requireSupervisor(req);
    const dateKey = resolveDateKey(req.body?.date);

    const [employeesSnap, rows, attendanceSnap, customSnap] = await Promise.all([
      db.collection("employees").where("status", "==", "active").get(),
      computeActivityRows([dateKey]),
      db.collection("attendanceRecords").where("date", "==", dateKey).get(),
      db.collection("customDepartments").get(),
    ]);

    const activity = new Map(rows.map((r) => [r.employeeId, r]));
    const attendance = new Map(attendanceSnap.docs.map((d) => [d.data().employeeId as string, d.data()]));
    const customLabels = new Map(customSnap.docs.map((d) => [d.id, (d.data().label as string | undefined) ?? d.id]));
    const fixedLabels: Record<string, string> = {
      dispatcher: "Sotuv menejeri",
      worker: "Ishchi",
      delivery: "Dastavchik",
      ...BUILTIN_DEPARTMENT_LABELS,
    };

    const employees = employeesSnap.docs
      .map((doc) => {
        const e = doc.data();
        const department = (e.department as string | undefined) ?? "";
        const a = activity.get(doc.id);
        const att = attendance.get(doc.id);
        const pending = Array.isArray(e.pendingWarnings) ? (e.pendingWarnings as unknown[]).length : 0;
        return {
          id: doc.id,
          fullName: (e.fullName as string | undefined) ?? "Noma'lum",
          department,
          departmentLabel: fixedLabels[department] ?? customLabels.get(department) ?? (e.departmentLabel as string | undefined) ?? department,
          specializations: (e.specializations as string[] | undefined) ?? [],
          canPack: e.canPack === true,
          washed: a?.washedCount ?? 0,
          packed: a?.packedCount ?? 0,
          delivered: a?.deliveredCount ?? 0,
          deliveredTotal: a?.deliveredTotal ?? 0,
          pickedUp: a?.pickedUpCount ?? 0,
          created: a?.ordersCreated ?? 0,
          pendingWarnings: pending,
          attendance: att
            ? { status: (att.status as string) ?? "on_time", time: (att.checkedInTime as string | null) ?? null }
            : null,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    res.json({ date: dateKey, employees });
  } catch (err) {
    sendError(res, err);
  }
});

/** Bitta xodimning bir kunlik ishi — profil sahifasidagi javob bilan bir xil. */
supervisorRouter.post("/supervisorEmployeeActivity", withAuth, async (req: AuthedRequest, res) => {
  try {
    requireSupervisor(req);
    const employeeId = typeof req.body?.employeeId === "string" ? req.body.employeeId.trim() : "";
    if (!employeeId) throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    const dateKey = resolveDateKey(req.body?.date);
    res.json(await buildDailyActivity(employeeId, dateKey));
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Dastavchikka topshiriq                                               */
/* ------------------------------------------------------------------ */

interface StopInput {
  orderId: string;
  itemIds: string[] | null;
}

function parseStops(raw: unknown): StopInput[] {
  if (!Array.isArray(raw)) throw new ApiError(400, "invalid-argument", "Buyurtmalar ro'yxati noto'g'ri");
  if (raw.length > MAX_STOPS) {
    throw new ApiError(400, "invalid-argument", `Bitta topshiriqda ko'pi bilan ${MAX_STOPS} ta buyurtma bo'ladi`);
  }
  const seen = new Set<string>();
  return raw.map((entry) => {
    const orderId = typeof entry?.orderId === "string" ? entry.orderId.trim() : "";
    if (!orderId) throw new ApiError(400, "invalid-argument", "Buyurtma ko'rsatilmagan");
    if (seen.has(orderId)) throw new ApiError(400, "invalid-argument", "Bir buyurtma ikki marta tanlangan");
    seen.add(orderId);
    let itemIds: string[] | null = null;
    if (entry?.itemIds !== undefined && entry?.itemIds !== null) {
      if (!Array.isArray(entry.itemIds) || entry.itemIds.some((x: unknown) => typeof x !== "string" || !x)) {
        throw new ApiError(400, "invalid-argument", "Mahsulotlar ro'yxati noto'g'ri");
      }
      itemIds = [...new Set(entry.itemIds as string[])];
    }
    return { orderId, itemIds };
  });
}

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/**
 * Dastavchikning bir kunlik topshirig'ini SAQLAYDI (to'liq ro'yxat):
 * tanlangan buyurtmalarga biriktiriladi, shu kun shu dastavchikka
 * biriktirilgan, lekin ro'yxatda yo'q buyurtmalardan olib tashlanadi.
 * Bo'sh ro'yxat — topshiriqni bekor qilish.
 *
 * Topshiriq turi buyurtma holatidan aniqlanadi:
 *  - "Yangi" (olib kelish) — mijozdan sexga olib kelish;
 *  - "Sexga keldi" — tayyor mahsulotlarni yetkazish; `itemIds` berilsa
 *    aynan o'shalar (hammasi "Tayyor" bo'lishi shart), berilmasa hozir
 *    tayyor bo'lganlarning hammasi.
 *
 * Buyurtmadagi `assignment` maydoniga yoziladi — dastavchik ilovasi faol
 * buyurtmalarni allaqachon jonli o'qiydi, qo'shimcha so'rov kerak emas.
 */
supervisorRouter.post("/supervisorAssignDeliveries", withAuth, async (req: AuthedRequest, res) => {
  try {
    const recorderId = requireSupervisor(req);
    const driverId = typeof req.body?.driverId === "string" ? req.body.driverId.trim() : "";
    if (!driverId) throw new ApiError(400, "invalid-argument", "Dastavchikni tanlang");

    const now = new Date();
    const today = businessDateString(now);
    const dateKey = parseDateKey(req.body?.date, now);
    if (!dateKey) throw new ApiError(400, "invalid-argument", "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
    const lastAllowed = businessDateString(new Date(businessDayRangeUtc(today)!.start.getTime() + MAX_DAYS_AHEAD * 86_400_000));
    if (dateKey < today || dateKey > lastAllowed) {
      throw new ApiError(400, "invalid-argument", `Topshiriq bugundan ${MAX_DAYS_AHEAD} kungacha bo'lgan kunga beriladi`);
    }

    const stops = parseStops(req.body?.stops);
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : "";

    const [driverSnap, recorderName] = await Promise.all([
      db.collection("employees").doc(driverId).get(),
      nameOf(recorderId),
    ]);
    const driver = driverSnap.data();
    if (!driverSnap.exists || driver?.status !== "active") {
      throw new ApiError(404, "not-found", "Dastavchik topilmadi yoki ishdan bo'shatilgan");
    }
    if (driver.department !== "delivery") {
      throw new ApiError(400, "invalid-argument", "Tanlangan xodim dastavchik emas");
    }
    const driverName = (driver.fullName as string | undefined) ?? "Dastavchik";

    const orderRefs = stops.map((s) => db.collection("orders").doc(s.orderId));
    const previousQuery = db
      .collection("orders")
      .where("assignment.driverId", "==", driverId)
      .where("assignment.date", "==", dateKey);

    const result = await db.runTransaction(async (tx) => {
      const [orderSnaps, previousSnap] = await Promise.all([
        orderRefs.length ? tx.getAll(...orderRefs) : Promise.resolve([]),
        tx.get(previousQuery),
      ]);

      const writes: { ref: FirebaseFirestore.DocumentReference; assignment: Record<string, unknown> }[] = [];
      orderSnaps.forEach((snap, seq) => {
        const stop = stops[seq];
        if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
        const order = snap.data()!;
        const label = `#${order.orderNumber ?? "?"}`;
        if (order.serviceType !== "pickup") {
          throw new ApiError(400, "invalid-argument", `${label}: joyida yuvish buyurtmasi dastavchikka biriktirilmaydi`);
        }

        let kind: "pickup" | "delivery";
        let itemIds: string[] = [];
        if (order.status === "new" || order.status === "picked_up") {
          kind = "pickup";
        } else if (order.status === "brought_in") {
          kind = "delivery";
          const mirror = Array.isArray(order.itemsMirror) ? (order.itemsMirror as Record<string, unknown>[]) : [];
          const ready = new Map(
            mirror.filter((i) => i.status === "ready").map((i) => [String(i.id), i] as const),
          );
          if (ready.size === 0) {
            throw new ApiError(412, "failed-precondition", `${label}: yetkazishga tayyor mahsulot yo'q`);
          }
          if (stop.itemIds && stop.itemIds.length > 0) {
            for (const id of stop.itemIds) {
              if (!ready.has(id)) {
                const any = mirror.find((i) => String(i.id) === id);
                const sub = any ? `${order.orderNumber}/${any.itemNumber}` : "mahsulot";
                throw new ApiError(412, "failed-precondition", `${label}: ${sub} hali tayyor emas yoki allaqachon topshirilgan`);
              }
            }
            itemIds = stop.itemIds;
          } else {
            itemIds = [...ready.keys()];
          }
        } else {
          throw new ApiError(412, "failed-precondition", `${label}: buyurtma yakunlangan yoki boshqa holatda`);
        }

        writes.push({
          ref: snap.ref,
          assignment: {
            driverId,
            driverName,
            date: dateKey,
            kind,
            itemIds,
            seq,
            note: note || null,
            assignedBy: recorderId,
            assignedByName: recorderName,
            assignedAt: Timestamp.fromDate(now),
          },
        });
      });

      const kept = new Set(stops.map((s) => s.orderId));
      const cleared = previousSnap.docs.filter((d) => !kept.has(d.id));
      for (const w of writes) tx.update(w.ref, { assignment: w.assignment });
      for (const d of cleared) tx.update(d.ref, { assignment: FieldValue.delete() });
      return { assigned: writes.length, cleared: cleared.length };
    });

    if (result.assigned > 0) {
      const tomorrow = businessDateString(new Date(businessDayRangeUtc(today)!.start.getTime() + 86_400_000));
      const [, month, day] = dateKey.split("-").map(Number);
      const when = dateKey === today ? "Bugun" : dateKey === tomorrow ? "Ertaga" : `${day}-${UZ_MONTHS[month - 1]}`;
      notifyLater(
        notifyEmployee(driverId, "Yangi topshiriq", `${when}: ${result.assigned} ta buyurtma sizga biriktirildi`, { type: "assignment" }),
      );
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

/** Bitta buyurtmani topshiriqdan olib tashlash. */
supervisorRouter.post("/supervisorClearAssignment", withAuth, async (req: AuthedRequest, res) => {
  try {
    requireSupervisor(req);
    const orderId = typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
    if (!orderId) throw new ApiError(400, "invalid-argument", "orderId majburiy");
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
    if (snap.data()?.assignment) await ref.update({ assignment: FieldValue.delete() });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Ogohlantirishlar                                                     */
/* ------------------------------------------------------------------ */

/**
 * Xodimga ogohlantirish. To'liq tarix `warnings` jamlanmasida, o'qilmagan
 * oxirgilari esa xodim hujjatida (`pendingWarnings`) — ilova xodim
 * hujjatini allaqachon jonli o'qiydi, ogohlantirish darhol ekranda
 * paydo bo'ladi va push-bildirishnoma ham yuboriladi.
 */
supervisorRouter.post("/supervisorWarnEmployee", withAuth, async (req: AuthedRequest, res) => {
  try {
    const recorderId = requireSupervisor(req);
    const employeeId = typeof req.body?.employeeId === "string" ? req.body.employeeId.trim() : "";
    const text = typeof req.body?.text === "string" ? req.body.text.trim().replace(/\s+\n/g, "\n") : "";
    if (!employeeId) throw new ApiError(400, "invalid-argument", "Xodimni tanlang");
    if (employeeId === recorderId) throw new ApiError(400, "invalid-argument", "O'zingizga ogohlantirish berib bo'lmaydi");
    if (text.length < 3) throw new ApiError(400, "invalid-argument", "Ogohlantirish matnini yozing");
    if (text.length > MAX_WARNING_LENGTH) {
      throw new ApiError(400, "invalid-argument", `Matn ${MAX_WARNING_LENGTH} belgidan oshmasin`);
    }

    const recorderName = await nameOf(recorderId);
    const employeeRef = db.collection("employees").doc(employeeId);
    const warningRef = db.collection("warnings").doc();
    const at = Timestamp.now();

    const employeeName = await db.runTransaction(async (tx) => {
      const snap = await tx.get(employeeRef);
      const employee = snap.data();
      if (!snap.exists || employee?.status !== "active") {
        throw new ApiError(404, "not-found", "Xodim topilmadi yoki ishdan bo'shatilgan");
      }
      const name = (employee.fullName as string | undefined) ?? "Xodim";
      tx.set(warningRef, {
        employeeId,
        employeeName: name,
        text,
        createdBy: recorderId,
        createdByName: recorderName,
        createdAt: at,
        ackAt: null,
      });
      const pending = Array.isArray(employee.pendingWarnings) ? (employee.pendingWarnings as unknown[]) : [];
      const next = [...pending, { id: warningRef.id, text, byName: recorderName, at }].slice(-MAX_PENDING_WARNINGS);
      tx.update(employeeRef, { pendingWarnings: next });
      return name;
    });

    notifyLater(notifyEmployee(employeeId, "Ogohlantirish", text, { type: "warning", warningId: warningRef.id }));
    res.json({ ok: true, warningId: warningRef.id, employeeName });
  } catch (err) {
    sendError(res, err);
  }
});

/** Xodim ogohlantirish bilan tanishganini belgilaydi (o'zinikini). */
supervisorRouter.post("/acknowledgeWarning", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const warningId = typeof req.body?.warningId === "string" ? req.body.warningId.trim() : "";
    if (!warningId) throw new ApiError(400, "invalid-argument", "warningId majburiy");

    const warningRef = db.collection("warnings").doc(warningId);
    const employeeRef = db.collection("employees").doc(employeeId);
    await db.runTransaction(async (tx) => {
      const [warningSnap, employeeSnap] = await Promise.all([tx.get(warningRef), tx.get(employeeRef)]);
      if (!warningSnap.exists || warningSnap.data()?.employeeId !== employeeId) {
        throw new ApiError(404, "not-found", "Ogohlantirish topilmadi");
      }
      if (!warningSnap.data()?.ackAt) tx.update(warningRef, { ackAt: Timestamp.now() });
      const pending = Array.isArray(employeeSnap.data()?.pendingWarnings)
        ? (employeeSnap.data()!.pendingWarnings as { id?: string }[])
        : [];
      const next = pending.filter((w) => w?.id !== warningId);
      if (next.length !== pending.length) tx.update(employeeRef, { pendingWarnings: next });
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Xodimning ogohlantirishlar tarixi (eng yangisi birinchi). */
supervisorRouter.post("/employeeWarnings", withAuth, async (req: AuthedRequest, res) => {
  try {
    requireSupervisor(req);
    const employeeId = typeof req.body?.employeeId === "string" ? req.body.employeeId.trim() : "";
    if (!employeeId) throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    // Faqat `employeeId` bo'yicha (bitta maydon) — qo'shimcha composite
    // indeks kerak emas; bir xodimda ogohlantirish kam bo'ladi.
    const snap = await db.collection("warnings").where("employeeId", "==", employeeId).get();
    const warnings = snap.docs
      .map((d) => {
        const w = d.data();
        return {
          id: d.id,
          text: (w.text as string) ?? "",
          createdByName: (w.createdByName as string) ?? "",
          createdAt: (w.createdAt as Timestamp | undefined)?.toDate().toISOString() ?? null,
          ackAt: (w.ackAt as Timestamp | null | undefined)?.toDate().toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 50);
    res.json({ warnings });
  } catch (err) {
    sendError(res, err);
  }
});

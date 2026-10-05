import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import {
  customerKey,
  customerRef,
  invalidateBonusCache,
  loadBonusPercent,
  validateBonusPercent,
  writeBonus,
} from "../lib/bonus";
import { prepaidCredit } from "../lib/prepayments";

export const bonusRouter = Router();

/** Buyurtmaga qo'llangan bonus yozuvi (`orders.bonusEntries`). */
interface BonusEntry {
  id: string;
  amount: number;
  at: Timestamp;
  employeeId: string;
  employeeName: string | null;
}

function bonusEntriesOf(order: Record<string, unknown>): BonusEntry[] {
  return Array.isArray(order.bonusEntries) ? (order.bonusEntries as BonusEntry[]) : [];
}

/**
 * Mijozning bonus hisobi — buyurtma kartasi, to'lov oynasi va umumiy
 * qidiruv uchun. Istalgan xodim ko'ra oladi: bu mijozga "bonusingiz bor"
 * deb taklif qilish uchun kerak, moliyaviy sir emas.
 */
bonusRouter.post("/customerBonus", withAuth, async (req: AuthedRequest, res) => {
  try {
    const key = customerKey(req.body?.phone);
    if (!key) throw new ApiError(400, "invalid-argument", "To'liq telefon raqamini kiriting");
    const [snap, percent] = await Promise.all([customerRef(key).get(), loadBonusPercent()]);
    const c = snap.data() ?? {};
    res.json({
      balance: Math.max(0, Math.round((c.balance as number | undefined) ?? 0)),
      earnedTotal: Math.round((c.earnedTotal as number | undefined) ?? 0),
      spentTotal: Math.round((c.spentTotal as number | undefined) ?? 0),
      percent,
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Bonusni ishlatish huquqi — mijozdan to'lov oladigan xodimlar: admin,
 * dastavchik, sotuv menejeri, oldindan to'lov yoki omborxona vakolati
 * borlar, joyida yuvishda esa shu buyurtma jamoasi.
 */
async function assertCanApplyBonus(
  req: AuthedRequest,
  order: Record<string, unknown>,
  employee: Record<string, unknown> | undefined,
): Promise<void> {
  const role = req.auth!.role;
  if (role === "admin" || role === "delivery" || role === "dispatcher") return;
  const employeeId = req.auth!.employeeId ?? req.auth!.uid;
  if (order.serviceType === "onsite" && Array.isArray(order.assignedTeam) && order.assignedTeam.includes(employeeId)) return;
  if (employee?.canTakePrepayment === true || employee?.canAccessWarehouse === true) return;
  throw new ApiError(403, "permission-denied", "Bonusni ishlatish huquqingiz yo'q");
}

/**
 * Mijoz bonusini buyurtmaga qo'llash — mijoz rozi bo'lganda ("bonusni
 * ishlatasizmi?"). Bonus buyurtmaga KREDIT bo'lib tushadi: oldindan
 * to'lov kabi topshirishda narxdan ayiriladi (lib/prepayments.ts), lekin
 * pul emas — kassaga kirmaydi va yangi bonus asosiga ham qo'shilmaydi.
 *
 * [amount] berilmasa — imkon qadar ko'p: hisobdagi butun bonus, lekin
 * buyurtmaning hali to'lanmagan qismidan oshmaydi.
 */
bonusRouter.post("/applyBonus", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, amount, actorName } = req.body ?? {};
    if (typeof orderId !== "string" || !orderId) throw new ApiError(400, "invalid-argument", "orderId majburiy");
    if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) {
      throw new ApiError(400, "invalid-argument", "Summa noto'g'ri");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const now = new Date();
    let applied = 0;
    let balanceAfter = 0;

    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = orderSnap.data()!;
      if (order.status === "done") throw new ApiError(412, "failed-precondition", "Buyurtma yakunlangan");
      const key = customerKey(order.phone);
      if (!key) throw new ApiError(412, "failed-precondition", "Mijoz telefon raqami noto'g'ri");

      const [itemsSnap, customerSnap, employeeSnap] = await Promise.all([
        order.serviceType === "pickup" ? tx.get(orderRef.collection("items")) : Promise.resolve(null),
        tx.get(customerRef(key)),
        tx.get(db.collection("employees").doc(employeeId)),
      ]);
      await assertCanApplyBonus(req, order, employeeSnap.data());

      // Hali to'lanmagan qism: yetkazilmagan mahsulotlar (pickup) yoki
      // butun buyurtma (joyida yuvish), mavjud kreditdan tashqari.
      const outstanding = itemsSnap
        ? itemsSnap.docs.filter((d) => d.data().status !== "done").reduce((s, d) => s + ((d.data().price as number | undefined) ?? 0), 0)
        : ((order.totalPrice as number | undefined) ?? 0);
      const remaining = Math.round(outstanding) - prepaidCredit(order);
      if (remaining <= 0) throw new ApiError(412, "failed-precondition", "Buyurtmada to'lanadigan summa qolmagan");

      const balance = Math.max(0, Math.round((customerSnap.data()?.balance as number | undefined) ?? 0));
      if (balance <= 0) throw new ApiError(412, "failed-precondition", "Mijozda bonus yo'q");

      applied = Math.min(balance, remaining, typeof amount === "number" ? Math.round(amount) : Number.POSITIVE_INFINITY);
      balanceAfter = balance - applied;
      const entry: BonusEntry = {
        id: db.collection("orders").doc().id,
        amount: applied,
        at: Timestamp.fromDate(now),
        employeeId,
        employeeName: typeof actorName === "string" && actorName.trim() ? actorName.trim() : null,
      };

      tx.update(orderRef, {
        bonusAmount: ((order.bonusAmount as number | undefined) ?? 0) + applied,
        bonusEntries: [...bonusEntriesOf(order), entry],
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeBonus(
        tx,
        key,
        -applied,
        { type: "spend", amount: applied, orderId, orderNumber: (order.orderNumber as number) ?? 0, employeeId },
        { phone: (order.phone as string) ?? "", name: (order.customerName as string) ?? "" },
        now,
      );
    });

    res.json({ ok: true, applied, balance: balanceAfter });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xato qo'llangan bonusni qaytarish — buyurtma yakunlanmagan va bu summa
 * topshirishda hali ishlatilmagan bo'lsa. Uni qo'llagan xodim yoki admin.
 */
bonusRouter.post("/cancelBonus", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { orderId, entryId } = req.body ?? {};
    if (typeof orderId !== "string" || !orderId || typeof entryId !== "string" || !entryId) {
      throw new ApiError(400, "invalid-argument", "orderId va entryId majburiy");
    }
    const orderRef = db.collection("orders").doc(orderId);
    const now = new Date();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new ApiError(404, "not-found", "Buyurtma topilmadi");
      const order = snap.data()!;
      const entries = bonusEntriesOf(order);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return; // Allaqachon qaytarilgan.
      if (req.auth!.role !== "admin" && entry.employeeId !== employeeId) {
        throw new ApiError(403, "permission-denied", "Faqat o'zingiz qo'llagan bonusni qaytara olasiz");
      }
      if (order.status === "done" || prepaidCredit(order) < entry.amount) {
        throw new ApiError(412, "failed-precondition", "Bonus topshirishda hisobga olingan — qaytarib bo'lmaydi");
      }
      const key = customerKey(order.phone);
      if (!key) throw new ApiError(412, "failed-precondition", "Mijoz telefon raqami noto'g'ri");

      tx.update(orderRef, {
        bonusAmount: Math.max(0, ((order.bonusAmount as number | undefined) ?? 0) - entry.amount),
        bonusEntries: entries.filter((e) => e.id !== entryId),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeBonus(
        tx,
        key,
        entry.amount,
        { type: "refund", amount: entry.amount, orderId, orderNumber: (order.orderNumber as number) ?? 0, employeeId },
        { phone: (order.phone as string) ?? "", name: (order.customerName as string) ?? "" },
        now,
      );
    });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Bonus foizi — admin panel sozlamalari. 0 — bonus berish to'xtatiladi. */
bonusRouter.post("/adminUpdateBonusSettings", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const percent = validateBonusPercent(req.body?.percent);
    if (percent === null) throw new ApiError(400, "invalid-argument", "Foiz 0 dan 20 gacha bo'lishi kerak");
    await db
      .collection("settings")
      .doc("bonus")
      .set({ percent, updatedBy: req.auth!.employeeId ?? req.auth!.uid, updatedAt: new Date() }, { merge: true });
    invalidateBonusCache();
    res.json({ ok: true, percent });
  } catch (err) {
    sendError(res, err);
  }
});

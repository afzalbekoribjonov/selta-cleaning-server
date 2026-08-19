import { Router } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const tasksRouter = Router();

/**
 * "Boshqa" (4 ta doimiy bo'limga kirmaydigan) xodimlar uchun topshiriqlar —
 * talab #3/#5. Ikki tur:
 *  - 'single': bitta vazifa, oxirgi bajarilish sanasi bilan — xodim
 *    "Bajarildi" yoki "Kechikmoqdaman" deb belgilaydi.
 *  - 'monthly': bir oy ichida istalgan kunlarga tayinlangan mustaqil
 *    topshiriqlar ro'yxati — har biri faqat "Bajarildi" tugmasiga ega.
 * Status o'zgarishi hech qachon to'g'ridan-to'g'ri klient tomonidan
 * yozilmaydi (reja qarori #3 bilan bir xil tamoyil) — faqat shu server
 * yo'llari orqali.
 */

/** Admin — bitta xodim uchun oxirgi sanali vazifa yaratadi. */
tasksRouter.post("/adminCreateTask", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { employeeId, title, description, dueDate } = req.body ?? {};
    if (!employeeId || !title?.trim()) {
      throw new ApiError(400, "invalid-argument", "Xodim va vazifa matni majburiy");
    }
    const parsedDue = dueDate ? new Date(dueDate) : null;
    if (dueDate && isNaN(parsedDue!.getTime())) {
      throw new ApiError(400, "invalid-argument", "Oxirgi sana noto'g'ri");
    }

    const ref = db.collection("tasks").doc();
    await ref.set({
      employeeId,
      type: "single",
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: parsedDue ? Timestamp.fromDate(parsedDue) : null,
      status: "pending",
      delayNote: null,
      completedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: req.auth!.employeeId ?? req.auth!.uid,
    });

    res.json({ taskId: ref.id });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Admin — bir oy ichida istalgan kunlarga bir nechta mustaqil topshiriqni
 * bitta amalda yaratadi. `items`: [{ day: 1-31, title: string }].
 */
tasksRouter.post("/adminCreateMonthlyTasks", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { employeeId, monthKey, items } = req.body ?? {};
    if (!employeeId || !/^\d{4}-\d{2}$/.test(monthKey ?? "")) {
      throw new ApiError(400, "invalid-argument", "Xodim va oy (YYYY-MM) majburiy");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "invalid-argument", "Kamida bitta topshiriq kerak");
    }

    const [year, month] = monthKey.split("-").map(Number);
    const createdBy = req.auth!.employeeId ?? req.auth!.uid;
    const batch = db.batch();
    const taskIds: string[] = [];

    for (const item of items) {
      const day = Number(item?.day);
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      if (!title || !Number.isInteger(day) || day < 1 || day > 31) {
        throw new ApiError(400, "invalid-argument", "Har bir topshiriq uchun kun va matn to'g'ri bo'lishi kerak");
      }
      const scheduledDate = new Date(year, month - 1, day);
      if (scheduledDate.getMonth() !== month - 1) {
        throw new ApiError(400, "invalid-argument", `${day}-kun bu oyda mavjud emas`);
      }

      const ref = db.collection("tasks").doc();
      taskIds.push(ref.id);
      batch.set(ref, {
        employeeId,
        type: "monthly",
        title,
        description: null,
        monthKey,
        scheduledDate: Timestamp.fromDate(scheduledDate),
        status: "pending",
        delayNote: null,
        completedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy,
      });
    }

    await batch.commit();
    res.json({ taskIds });
  } catch (err) {
    sendError(res, err);
  }
});

tasksRouter.post("/adminDeleteTask", withAuth, requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.body ?? {};
    if (!taskId) throw new ApiError(400, "invalid-argument", "taskId majburiy");

    const ref = db.collection("tasks").doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Topshiriq topilmadi");

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Xodim — o'ziga tegishli vazifani "Bajarildi" deb belgilaydi. */
tasksRouter.post("/markTaskDone", withAuth, async (req: AuthedRequest, res) => {
  try {
    const { taskId } = req.body ?? {};
    if (!taskId) throw new ApiError(400, "invalid-argument", "taskId majburiy");

    const ref = db.collection("tasks").doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Topshiriq topilmadi");
    if (snap.data()!.employeeId !== req.auth!.employeeId) {
      throw new ApiError(403, "permission-denied", "Bu topshiriq sizga tegishli emas");
    }

    await ref.update({ status: "done", completedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Xodim — faqat 'single' turdagi vazifani "Kechikmoqdaman" deb belgilaydi. */
tasksRouter.post("/markTaskDelayed", withAuth, async (req: AuthedRequest, res) => {
  try {
    const { taskId, delayNote } = req.body ?? {};
    if (!taskId) throw new ApiError(400, "invalid-argument", "taskId majburiy");

    const ref = db.collection("tasks").doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "not-found", "Topshiriq topilmadi");
    const data = snap.data()!;
    if (data.employeeId !== req.auth!.employeeId) {
      throw new ApiError(403, "permission-denied", "Bu topshiriq sizga tegishli emas");
    }
    if (data.type !== "single") {
      throw new ApiError(400, "invalid-argument", "Faqat vazifa turidagi topshiriqni kechiktirish mumkin");
    }

    await ref.update({ status: "delayed", delayNote: delayNote?.trim() || null });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

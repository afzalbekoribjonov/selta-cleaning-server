import { randomUUID } from "crypto";
import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth } from "../lib/admin";
import { hashPin, isValidFourDigitPin } from "../lib/pin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const employeeAdminRouter = Router();

/** Admin panelda "Yangi xodim" tugmasi — talab #2/#3. */
employeeAdminRouter.post("/adminCreateEmployee", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { fullName, phone, department, pin, salary } = req.body ?? {};

    if (!fullName?.trim() || !phone?.trim() || !department) {
      throw new ApiError(400, "invalid-argument", "Ism, telefon va bo'lim majburiy");
    }
    if (!isValidFourDigitPin(pin ?? "")) {
      throw new ApiError(400, "invalid-argument", "PIN 4 ta raqamdan iborat bo'lishi kerak");
    }

    const uid = randomUUID();
    const employeeRef = db.collection("employees").doc();

    await db.runTransaction(async (tx) => {
      tx.set(employeeRef, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        department,
        status: "active",
        salary: salary ?? null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: req.auth!.employeeId ?? req.auth!.uid,
      });
      tx.set(employeeRef.collection("private").doc("credentials"), {
        pinHash: hashPin(pin),
        firebaseUid: uid,
        failedAttempts: 0,
        lockedUntil: null,
      });
    });

    res.json({ employeeId: employeeRef.id });
  } catch (err) {
    sendError(res, err);
  }
});

employeeAdminRouter.post("/adminSetEmployeePin", withAuth, requireAdmin, async (req, res) => {
  try {
    const { employeeId, newPin } = req.body ?? {};
    if (!isValidFourDigitPin(newPin ?? "")) {
      throw new ApiError(400, "invalid-argument", "PIN 4 ta raqamdan iborat bo'lishi kerak");
    }

    const credentialsRef = db.collection("employees").doc(employeeId).collection("private").doc("credentials");
    const snap = await credentialsRef.get();
    if (!snap.exists) {
      throw new ApiError(404, "not-found", "Xodim topilmadi");
    }

    await credentialsRef.update({ pinHash: hashPin(newPin), failedAttempts: 0, lockedUntil: null });

    // PIN o'zgargach eski sessiya darhol ishlamay qolishi kerak (reja qarori #5).
    const uid = snap.data()?.firebaseUid;
    if (uid) {
      await auth.revokeRefreshTokens(uid);
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

employeeAdminRouter.post("/adminTerminateEmployee", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { employeeId } = req.body ?? {};

    const employeeRef = db.collection("employees").doc(employeeId);
    const credentialsRef = employeeRef.collection("private").doc("credentials");
    const [employeeSnap, credentialsSnap] = await Promise.all([employeeRef.get(), credentialsRef.get()]);
    if (!employeeSnap.exists) {
      throw new ApiError(404, "not-found", "Xodim topilmadi");
    }

    await employeeRef.update({
      status: "terminated",
      terminatedAt: FieldValue.serverTimestamp(),
      terminatedBy: req.auth!.employeeId ?? req.auth!.uid,
    });

    const uid = credentialsSnap.data()?.firebaseUid;
    if (uid) {
      await auth.revokeRefreshTokens(uid);
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

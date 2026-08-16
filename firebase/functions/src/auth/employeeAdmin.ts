import { randomUUID } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth } from "../lib/admin";
import { hashPin, isValidFourDigitPin } from "../lib/pin";
import { assertAdmin } from "../lib/authz";
import type { Department } from "../lib/pipeline";

interface CreateEmployeeInput {
  fullName: string;
  phone: string;
  department: Department;
  pin: string;
  salary?: { method: string; params: Record<string, number | string> };
}

/** Admin panelda "Yangi xodim" tugmasi — talab #2/#3. */
export const adminCreateEmployee = onCall<CreateEmployeeInput>(async (request) => {
  assertAdmin(request);
  const { fullName, phone, department, pin, salary } = request.data;

  if (!fullName?.trim() || !phone?.trim() || !department) {
    throw new HttpsError("invalid-argument", "Ism, telefon va bo'lim majburiy");
  }
  if (!isValidFourDigitPin(pin ?? "")) {
    throw new HttpsError("invalid-argument", "PIN 4 ta raqamdan iborat bo'lishi kerak");
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
      createdBy: request.auth!.token.employeeId ?? request.auth!.uid,
    });
    tx.set(employeeRef.collection("private").doc("credentials"), {
      pinHash: hashPin(pin),
      firebaseUid: uid,
      failedAttempts: 0,
      lockedUntil: null,
    });
  });

  return { employeeId: employeeRef.id };
});

export const adminSetEmployeePin = onCall<{ employeeId: string; newPin: string }>(async (request) => {
  assertAdmin(request);
  const { employeeId, newPin } = request.data;
  if (!isValidFourDigitPin(newPin ?? "")) {
    throw new HttpsError("invalid-argument", "PIN 4 ta raqamdan iborat bo'lishi kerak");
  }

  const credentialsRef = db.collection("employees").doc(employeeId).collection("private").doc("credentials");
  const snap = await credentialsRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Xodim topilmadi");
  }

  await credentialsRef.update({ pinHash: hashPin(newPin), failedAttempts: 0, lockedUntil: null });

  // PIN o'zgargach eski sessiya darhol ishlamay qolishi kerak (reja qarori #5).
  const uid = snap.data()?.firebaseUid;
  if (uid) {
    await auth.revokeRefreshTokens(uid);
  }

  return { ok: true };
});

export const adminTerminateEmployee = onCall<{ employeeId: string }>(async (request) => {
  assertAdmin(request);
  const { employeeId } = request.data;

  const employeeRef = db.collection("employees").doc(employeeId);
  const credentialsRef = employeeRef.collection("private").doc("credentials");
  const [employeeSnap, credentialsSnap] = await Promise.all([employeeRef.get(), credentialsRef.get()]);
  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Xodim topilmadi");
  }

  await employeeRef.update({
    status: "terminated",
    terminatedAt: FieldValue.serverTimestamp(),
    terminatedBy: request.auth!.token.employeeId ?? request.auth!.uid,
  });

  const uid = credentialsSnap.data()?.firebaseUid;
  if (uid) {
    await auth.revokeRefreshTokens(uid);
  }

  return { ok: true };
});

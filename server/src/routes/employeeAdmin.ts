import { randomUUID } from "crypto";
import { Router } from "express";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { db, auth } from "../lib/admin";
import { hashPin, isValidFourDigitPin } from "../lib/pin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";

export const employeeAdminRouter = Router();

const FIXED_DEPARTMENTS = new Set(["dispatcher", "worker", "delivery", "qc"]);

function slugifyDepartmentLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `kasb_${randomUUID().slice(0, 8)}`;
}

/**
 * `department` (mavjud kalit) yoki `newDepartment` (admin "Boshqa"ni tanlab,
 * yangi kasb nomi yozgan holat) dan kerakli bo'lim kalitini aniqlaydi.
 * Yangi kasb bo'lsa, `customDepartments/{slug}` reestr hujjatini (agar
 * hali yo'q bo'lsa) shu tranzaksiya ichida yaratadi. E'TIBOR: bu funksiya
 * o'z ichida `tx.get`/`tx.set` chaqiradi — chaqiruvchi buni tranzaksiyadagi
 * BOSHQA yozuvlardan OLDIN chaqirishi kerak (Firestore: avval o'qish, keyin
 * yozish qoidasi).
 *
 * `label` faqat CUSTOM kasblar uchun qaytariladi (doimiy 4 ta uchun null) —
 * `employees/{id}.departmentLabel`ga yoziladi, chunki oddiy xodim (admin
 * emas) `customDepartments` kolleksiyasini o'qiy olmaydi (faqat admin
 * ruxsati bor); shu denormalizatsiya bilan xodim mobil ilovada o'z
 * profilida kasb nomini ko'ra oladi.
 */
async function resolveDepartment(
  tx: Transaction,
  body: { department?: unknown; newDepartment?: { label?: unknown; includeInStats?: unknown } },
  createdBy: string,
): Promise<{ key: string; label: string | null }> {
  const newLabel = typeof body.newDepartment?.label === "string" ? body.newDepartment.label.trim() : "";
  if (newLabel) {
    const slug = slugifyDepartmentLabel(newLabel);
    if (FIXED_DEPARTMENTS.has(slug)) return { key: slug, label: null };

    const ref = db.collection("customDepartments").doc(slug);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        label: newLabel,
        includeInStats: !!body.newDepartment?.includeInStats,
        createdAt: FieldValue.serverTimestamp(),
        createdBy,
      });
    }
    return { key: slug, label: newLabel };
  }

  const department = typeof body.department === "string" ? body.department.trim() : "";
  if (department) {
    if (FIXED_DEPARTMENTS.has(department)) return { key: department, label: null };
    const snap = await tx.get(db.collection("customDepartments").doc(department));
    return { key: department, label: (snap.data()?.label as string | undefined) ?? null };
  }

  throw new ApiError(400, "invalid-argument", "Bo'lim (kasb) tanlanishi shart");
}

/** Admin panelning "Xodimlar" sahifasi uchun to'liq ro'yxat (barcha bo'lim/holat). */
employeeAdminRouter.post("/adminListEmployees", withAuth, requireAdmin, async (_req, res) => {
  try {
    const snap = await db.collection("employees").orderBy("createdAt", "desc").get();
    res.json({
      employees: snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          fullName: data.fullName,
          phone: data.phone,
          department: data.department,
          departmentLabel: data.departmentLabel ?? null,
          status: data.status,
          salary: data.salary ?? null,
          createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
          terminatedAt: data.terminatedAt?.toDate?.().toISOString() ?? null,
        };
      }),
    });
  } catch (err) {
    sendError(res, err);
  }
});

/** Admin panelda "Yangi xodim" tugmasi — talab #2/#3. */
employeeAdminRouter.post("/adminCreateEmployee", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { fullName, phone, department, newDepartment, pin, salary } = req.body ?? {};

    if (!fullName?.trim() || !phone?.trim()) {
      throw new ApiError(400, "invalid-argument", "Ism va telefon majburiy");
    }
    if (!isValidFourDigitPin(pin ?? "")) {
      throw new ApiError(400, "invalid-argument", "PIN 4 ta raqamdan iborat bo'lishi kerak");
    }

    const uid = randomUUID();
    const employeeRef = db.collection("employees").doc();
    const createdBy = req.auth!.employeeId ?? req.auth!.uid;

    await db.runTransaction(async (tx) => {
      const resolved = await resolveDepartment(tx, { department, newDepartment }, createdBy);

      tx.set(employeeRef, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        department: resolved.key,
        departmentLabel: resolved.label,
        status: "active",
        salary: salary ?? null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy,
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

/** Xodimning ismi/telefonini tahrirlash. */
employeeAdminRouter.post("/adminUpdateEmployee", withAuth, requireAdmin, async (req, res) => {
  try {
    const { employeeId, fullName, phone } = req.body ?? {};
    if (!employeeId) {
      throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    }
    if (!fullName?.trim() || !phone?.trim()) {
      throw new ApiError(400, "invalid-argument", "Ism va telefon majburiy");
    }

    const employeeRef = db.collection("employees").doc(employeeId);
    const snap = await employeeRef.get();
    if (!snap.exists) {
      throw new ApiError(404, "not-found", "Xodim topilmadi");
    }

    await employeeRef.update({ fullName: fullName.trim(), phone: phone.trim() });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Xodimning kasbini (bo'limini) o'zgartiradi — eski/yangi qiymat
 * `employees/{id}/departmentHistory`ga audit yozuvi sifatida saqlanadi.
 * Mobil ilovadagi custom-claims (role/department) har safar `loginWithPin`
 * chaqirilganda Firestore'dan QAYTA o'qiladi (auth.ts) — shuning uchun
 * bu yerda faqat `department`ni yangilash kifoya, lekin joriy sessiya
 * darhol eskirgan ruxsat bilan davom etmasligi uchun (PIN reset/terminate
 * bilan bir xil naqsh) refresh token'lar bekor qilinadi — xodim qayta PIN
 * kiritganda yangi kasbiga mos huquqlarni oladi.
 */
employeeAdminRouter.post("/adminChangeEmployeeDepartment", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { employeeId, department, newDepartment } = req.body ?? {};
    if (!employeeId) {
      throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    }

    const employeeRef = db.collection("employees").doc(employeeId);
    const changedBy = req.auth!.employeeId ?? req.auth!.uid;

    const result = await db.runTransaction(async (tx) => {
      const employeeSnap = await tx.get(employeeRef);
      if (!employeeSnap.exists) {
        throw new ApiError(404, "not-found", "Xodim topilmadi");
      }
      const fromDepartment = employeeSnap.data()!.department as string;
      const resolved = await resolveDepartment(tx, { department, newDepartment }, changedBy);
      const toDepartment = resolved.key;

      if (toDepartment === fromDepartment) {
        throw new ApiError(400, "invalid-argument", "Xodim allaqachon shu kasbda ishlamoqda");
      }

      tx.update(employeeRef, { department: toDepartment, departmentLabel: resolved.label });
      tx.set(employeeRef.collection("departmentHistory").doc(), {
        fromDepartment,
        toDepartment,
        changedBy,
        changedAt: FieldValue.serverTimestamp(),
      });

      return { fromDepartment, toDepartment };
    });

    // Joriy mobil sessiya darhol eski kasb huquqi bilan ishlamasligi uchun.
    const credentialsSnap = await employeeRef.collection("private").doc("credentials").get();
    const uid = credentialsSnap.data()?.firebaseUid;
    if (uid) {
      await auth.revokeRefreshTokens(uid);
    }

    res.json({ ok: true, ...result });
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

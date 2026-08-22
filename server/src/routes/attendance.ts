import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { distanceMeters } from "../lib/geo";
import { businessDateString, businessMinutesSinceMidnight, parseHHMM } from "../lib/businessTime";

export const attendanceRouter = Router();

interface AttendanceConfig {
  enabled: boolean;
  arrivalTime: string; // "08:00"
  lateToleranceMinutes: number;
  location: { lat: number; lng: number } | null;
  radiusMeters: number;
}

async function getAttendanceConfig(): Promise<AttendanceConfig> {
  const snap = await db.collection("settings").doc("attendance").get();
  const data = snap.data() ?? {};
  return {
    enabled: data.enabled === true,
    arrivalTime: typeof data.arrivalTime === "string" ? data.arrivalTime : "08:00",
    lateToleranceMinutes: typeof data.lateToleranceMinutes === "number" ? data.lateToleranceMinutes : 30,
    location: data.location && typeof data.location.lat === "number" && typeof data.location.lng === "number" ? data.location : null,
    radiusMeters: typeof data.radiusMeters === "number" ? data.radiusMeters : 200,
  };
}

/**
 * Xodim ilovasi fonga/oldingi holatga qaytganda (yoki ochilganda), agar
 * davomat oynasi ichida bo'lsa, chaqiradi — sokin, hech qanday interfeys
 * ko'rsatmasdan (talab: "hech narsa ko'rsatilmaydi"). Vaqt oynasi va
 * masofa serverning o'zida (mijoz soatiga ishonmasdan) tekshiriladi.
 * Har qanday sabab bilan yozilmasa ham xatolik qaytarilmaydi — mijoz
 * bu chaqiruvni har doim "unut" (fire-and-forget) sifatida yuboradi.
 */
attendanceRouter.post("/submitAttendanceCheckin", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { lat, lng } = req.body ?? {};
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new ApiError(400, "invalid-argument", "lat/lng majburiy");
    }

    const config = await getAttendanceConfig();
    if (!config.enabled || !config.location) {
      return res.json({ ok: true, recorded: false });
    }

    const empSnap = await db.collection("employees").doc(employeeId).get();
    if (!empSnap.exists || empSnap.data()?.attendanceEnabled !== true) {
      return res.json({ ok: true, recorded: false });
    }

    const arrivalMinutes = parseHHMM(config.arrivalTime);
    if (arrivalMinutes == null) {
      return res.json({ ok: true, recorded: false });
    }

    const now = new Date();
    const nowMinutes = businessMinutesSinceMidnight(now);
    const windowEnd = arrivalMinutes + config.lateToleranceMinutes;
    if (nowMinutes < arrivalMinutes || nowMinutes >= windowEnd) {
      return res.json({ ok: true, recorded: false });
    }

    const distance = distanceMeters(config.location.lat, config.location.lng, lat, lng);
    if (distance > config.radiusMeters) {
      return res.json({ ok: true, recorded: false });
    }

    const dateStr = businessDateString(now);
    const recordRef = db.collection("attendanceRecords").doc(`${employeeId}_${dateStr}`);

    // Idempotent — shu kun uchun allaqachon yozuv bo'lsa, ustidan yozmaymiz
    // (xodim oyna ichida ilovani bir necha marta ochsa ham birinchi
    // muvaffaqiyatli belgi saqlanib qoladi).
    const existing = await recordRef.get();
    if (existing.exists) {
      return res.json({ ok: true, recorded: false });
    }

    const status = nowMinutes <= arrivalMinutes ? "on_time" : "late";
    await recordRef.set({
      employeeId,
      date: dateStr,
      status,
      checkedInAt: FieldValue.serverTimestamp(),
      gpsCoords: `${lat},${lng}`,
      distanceMeters: Math.round(distance),
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ ok: true, recorded: true, status });
  } catch (err) {
    sendError(res, err);
  }
});

attendanceRouter.post("/adminSetAttendanceConfig", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { enabled, arrivalTime, lateToleranceMinutes, location, radiusMeters } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      throw new ApiError(400, "invalid-argument", "enabled noto'g'ri");
    }
    if (parseHHMM(arrivalTime) == null) {
      throw new ApiError(400, "invalid-argument", "Ishga kelish vaqti noto'g'ri (SS:DD)");
    }
    if (typeof lateToleranceMinutes !== "number" || lateToleranceMinutes < 1 || lateToleranceMinutes > 240) {
      throw new ApiError(400, "invalid-argument", "Kechikish chegarasi 1-240 daqiqa oralig'ida bo'lishi kerak");
    }
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      throw new ApiError(400, "invalid-argument", "Joylashuv (lat/lng) majburiy");
    }
    if (typeof radiusMeters !== "number" || radiusMeters < 10 || radiusMeters > 5000) {
      throw new ApiError(400, "invalid-argument", "Radius 10-5000 metr oralig'ida bo'lishi kerak");
    }

    await db.collection("settings").doc("attendance").set(
      {
        enabled,
        arrivalTime,
        lateToleranceMinutes,
        location: { lat: location.lat, lng: location.lng },
        radiusMeters,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.auth!.uid,
      },
      { merge: true },
    );

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

/** Davomat nazoratiga qaysi xodimlar kiritilganini belgilaydi (talab:
 * "admin belgilab qo'ygan xodimlarnigina"). */
attendanceRouter.post("/adminSetEmployeeAttendance", withAuth, requireAdmin, async (req, res) => {
  try {
    const { employeeId, attendanceEnabled } = req.body ?? {};
    if (!employeeId) {
      throw new ApiError(400, "invalid-argument", "employeeId majburiy");
    }
    if (typeof attendanceEnabled !== "boolean") {
      throw new ApiError(400, "invalid-argument", "attendanceEnabled noto'g'ri");
    }

    const employeeRef = db.collection("employees").doc(employeeId);
    const snap = await employeeRef.get();
    if (!snap.exists) {
      throw new ApiError(404, "not-found", "Xodim topilmadi");
    }

    // `attendanceEnabledAt` — har safar YOQILGANDA yangilanadi (o'chirib
    // qayta yoqilsa ham), shunda admin panel undan OLDINGI kunlarni
    // "kelmagan" deb noto'g'ri belgilamaydi (talab: faqat belgilangan
    // xodimlar, va faqat ular belgilangandan keyingi kunlar tekshiriladi).
    await employeeRef.update({
      attendanceEnabled,
      ...(attendanceEnabled ? { attendanceEnabledAt: FieldValue.serverTimestamp() } : {}),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

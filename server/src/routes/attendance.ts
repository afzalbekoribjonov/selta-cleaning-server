import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { distanceMeters } from "../lib/geo";
import {
  businessDateString,
  businessMinutesSinceMidnight,
  businessWeekday,
  formatBusinessHHMM,
  parseHHMM,
} from "../lib/businessTime";

export const attendanceRouter = Router();

/** Standart ish kunlari — Dushanbadan Shanbagacha (0=Yakshanba). */
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];

interface AttendanceConfig {
  enabled: boolean;
  arrivalTime: string; // "08:00"
  lateToleranceMinutes: number;
  location: { lat: number; lng: number } | null;
  radiusMeters: number;
  workDays: number[];
  enabledAt: Date | null;
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
    workDays: Array.isArray(data.workDays) ? (data.workDays as number[]) : DEFAULT_WORK_DAYS,
    enabledAt: data.enabledAt?.toDate?.() ?? null,
  };
}

/**
 * Xodim ilovasi ochilganda/fondan qaytganda chaqiradi — sokin, hech qanday
 * interfeys ko'rsatmasdan (talab: "hech narsa ko'rsatilmaydi").
 *
 * MUHIM (2026-09-03 da tuzatilgan mantiq): belgilash KUN DAVOMIDA istalgan
 * paytda qabul qilinadi, status esa belgilangan VAQTGA qarab aniqlanadi:
 *   - `arrivalTime` + `lateToleranceMinutes` = imtiyoz muddati (deadline)
 *   - deadline'gacha (ERTA kelgan ham) -> "on_time"
 *   - deadline'dan keyin -> "late"
 *
 * Avval tor oyna ([arrivalTime, arrivalTime+tolerance)) ishlatilardi va u
 * ikkita jiddiy xatoga olib kelardi: (1) ishga ERTA kelgan xodim umuman
 * yozilmay, "kelmagan" bo'lib qolardi; (2) "on_time" faqat aynan
 * arrivalTime daqiqasida mumkin edi, ya'ni imtiyoz muddati amalda
 * ishlamas, deyarli hamma "kechikkan" bo'lib yozilardi.
 */
attendanceRouter.post("/submitAttendanceCheckin", withAuth, async (req: AuthedRequest, res) => {
  try {
    const employeeId = req.auth!.employeeId ?? req.auth!.uid;
    const { lat, lng, issue } = req.body ?? {};

    const config = await getAttendanceConfig();
    if (!config.enabled || !config.location) {
      return res.json({ ok: true, recorded: false, reason: "disabled" });
    }

    const empSnap = await db.collection("employees").doc(employeeId).get();
    if (!empSnap.exists || empSnap.data()?.attendanceEnabled !== true) {
      return res.json({ ok: true, recorded: false, reason: "not_enrolled" });
    }

    const arrivalMinutes = parseHHMM(config.arrivalTime);
    if (arrivalMinutes == null) {
      return res.json({ ok: true, recorded: false, reason: "bad_config" });
    }

    const now = new Date();
    const dateStr = businessDateString(now);
    const recordRef = db.collection("attendanceRecords").doc(`${employeeId}_${dateStr}`);

    // Shu kun uchun allaqachon belgilangan bo'lsa — ustidan yozilmaydi
    // (birinchi tasdiqlangan kelish saqlanib qoladi).
    const existing = await recordRef.get();
    if (existing.exists) {
      return res.json({ ok: true, recorded: false, reason: "already" });
    }

    // Talab: adminda "kelmagan" bilan "telefonda GPS o'chiq" farqlanishi
    // kerak. Klient joylashuvni ololmasa shu bayroq bilan xabar beradi —
    // bu davomat yozuvi EMAS, faqat admin uchun izoh (keyinroq haqiqiy
    // belgilash kelsa, u baribir yoziladi).
    if (typeof issue === "string" && issue.length > 0 && issue.length <= 40) {
      await db
        .collection("attendanceIssues")
        .doc(`${employeeId}_${dateStr}`)
        .set(
          { employeeId, date: dateStr, issue, reportedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      return res.json({ ok: true, recorded: false, reason: "issue_logged" });
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new ApiError(400, "invalid-argument", "lat/lng majburiy");
    }

    const distance = distanceMeters(config.location.lat, config.location.lng, lat, lng);
    if (distance > config.radiusMeters) {
      return res.json({ ok: true, recorded: false, reason: "out_of_range" });
    }

    const nowMinutes = businessMinutesSinceMidnight(now);
    const deadline = arrivalMinutes + config.lateToleranceMinutes;
    const status = nowMinutes <= deadline ? "on_time" : "late";

    await recordRef.set({
      employeeId,
      date: dateStr,
      status,
      checkedInAt: FieldValue.serverTimestamp(),
      // Ko'rsatish uchun biznes vaqtidagi "HH:MM" — admin brauzeri boshqa
      // vaqt zonasida bo'lsa ham soat to'g'ri ko'rinishi uchun.
      checkedInTime: formatBusinessHHMM(now),
      minutesFromArrival: nowMinutes - arrivalMinutes,
      isWorkDay: config.workDays.includes(businessWeekday(now)),
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
    const { enabled, arrivalTime, lateToleranceMinutes, location, radiusMeters, workDays } = req.body ?? {};
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
    const cleanWorkDays = Array.isArray(workDays)
      ? [...new Set(workDays.filter((d) => typeof d === "number" && d >= 0 && d <= 6))].sort()
      : DEFAULT_WORK_DAYS;
    if (cleanWorkDays.length === 0) {
      throw new ApiError(400, "invalid-argument", "Kamida bitta ish kuni tanlanishi kerak");
    }

    // `enabledAt` — davomat nazorati QACHON yoqilgani. Admin paneli undan
    // oldingi kunlarni "kelmagan" deb belgilamasligi uchun kerak (aks holda
    // tizim ishlatilmagan kunlar ham qizil bo'lib ko'rinardi). Faqat
    // o'chiqdan yoqiqqa o'tishda yangilanadi.
    const prevSnap = await db.collection("settings").doc("attendance").get();
    const wasEnabled = prevSnap.data()?.enabled === true;

    await db.collection("settings").doc("attendance").set(
      {
        enabled,
        arrivalTime,
        lateToleranceMinutes,
        location: { lat: location.lat, lng: location.lng },
        radiusMeters,
        workDays: cleanWorkDays,
        ...(enabled && !wasEnabled ? { enabledAt: FieldValue.serverTimestamp() } : {}),
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

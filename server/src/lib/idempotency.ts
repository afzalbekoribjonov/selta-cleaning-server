import type { NextFunction, Response } from "express";
import { db } from "./admin";
import type { AuthedRequest } from "./authz";

/**
 * Bitta amal IKKI MARTA bajarilmasligi kafolati.
 *
 * NEGA KERAK: ilova amallarni navbatga yozib, internet bo'lganda
 * yuboradi. Server amalni bajarib bo'lgach javob yo'lda yo'qolsa (signal
 * uzildi), ilova "yuborilmadi" deb o'ylab QAYTA yuboradi. Busiz bu
 * to'lovning ikki marta yozilishi, mahsulotlarning dublikati yoki
 * aslida bajarilgan amalning "xato" bo'lib ko'rinishiga olib kelardi.
 *
 * Ilova har bir amalga noyob `actionId` beradi. Server birinchi
 * so'rovda belgi qo'yadi va natijani saqlaydi; xuddi shu ID bilan kelgan
 * takroriy so'rovga amalni qayta bajarmasdan o'sha natijani qaytaradi.
 *
 * Holatlar:
 *  - belgi yo'q              -> "processing" belgisi qo'yiladi, amal bajariladi
 *  - "done"                  -> saqlangan javob qaytariladi (qayta bajarilmaydi)
 *  - "processing", yangi     -> 409 in-progress: birinchisi hali tugamagan,
 *                               ilova keyinroq qayta urinadi
 *  - "processing", eskirgan  -> server o'rtada qulagan; amal qayta bajariladi
 *                               (route'larning o'z tekshiruvlari dublikatdan
 *                               himoyalaydi)
 *
 * 5xx javob saqlanmaydi — u vaqtinchalik, qayta urinish yangidan
 * bajarilishi kerak. 4xx esa saqlanadi: rad etilgan amal qayta
 * yuborilganda ham xuddi shu sabab bilan rad etiladi.
 */

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
/** Shundan uzoq "processing" turgan belgi — qulagan so'rov qoldig'i. */
const STALE_AFTER_MS = 2 * 60_000;
/** Belgilar shuncha kun saqlanadi (Firestore TTL siyosati `expireAt` bo'yicha o'chiradi). */
const KEEP_DAYS = 30;

const markers = () => db.collection("processedActions");

function isAlreadyExists(err: unknown): boolean {
  // Firestore "ALREADY_EXISTS" gRPC kodi — 6.
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 6;
}

export function isValidActionId(value: unknown): value is string {
  return typeof value === "string" && ACTION_ID_PATTERN.test(value);
}

/**
 * `withAuth`dan keyin chaqiriladi. So'rovni o'zi tugatishi (takror
 * javob, 409) yoki `next()` bilan route'ga o'tkazishi mumkin.
 */
export async function runIdempotent(req: AuthedRequest, res: Response, next: NextFunction, actionId: string) {
  const employeeId = req.auth!.employeeId ?? req.auth!.uid;
  const ref = markers().doc(actionId);
  const startedAt = Date.now();
  const expireAt = new Date(startedAt + KEEP_DAYS * 24 * 60 * 60_000);
  const processing = { status: "processing", employeeId, path: req.path, startedAt, expireAt };

  try {
    // `create` atomar: bir vaqtda kelgan ikki so'rovdan faqat bittasi o'tadi.
    await ref.create(processing);
  } catch (err) {
    if (!isAlreadyExists(err)) {
      console.error("idempotency marker", err);
      return res.status(500).json({ error: "internal", message: "Server xatoligi yuz berdi" });
    }

    const verdict = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.data();
      if (!prev) {
        tx.set(ref, processing);
        return { kind: "run" as const };
      }
      // Boshqa xodimning ID'si — UUID'da amalda imkonsiz, lekin natijani
      // begona so'rovga hech qachon qaytarmaymiz.
      if (prev.employeeId !== employeeId) return { kind: "foreign" as const };
      if (prev.status === "done") return { kind: "replay" as const, code: prev.code as number, body: prev.body };
      if (startedAt - (prev.startedAt as number) < STALE_AFTER_MS) return { kind: "busy" as const };
      tx.set(ref, processing);
      return { kind: "run" as const };
    });

    if (verdict.kind === "replay") return res.status(verdict.code).json(verdict.body);
    if (verdict.kind === "busy") {
      return res.status(409).json({ error: "in-progress", message: "Amal hali bajarilmoqda" });
    }
    if (verdict.kind === "foreign") {
      return res.status(409).json({ error: "aborted", message: "Amal identifikatori band" });
    }
  }

  // Route qaytargan javobni ushlab, belgiga yoziladi. Javob KUTDIRILMAYDI:
  // belgi faqat javob yo'lda yo'qolganda kerak, u holda esa yozish
  // allaqachon tugagan bo'ladi.
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    const code = res.statusCode;
    const write =
      code >= 500
        ? ref.delete()
        : ref.set({ status: "done", employeeId, path: req.path, code, body: body ?? null, startedAt, expireAt });
    write.catch((err) => console.error("idempotency marker write", err));
    return send(body);
  };

  next();
}

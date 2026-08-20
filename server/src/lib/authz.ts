import type { NextFunction, Request, Response } from "express";
import { auth } from "./admin";

export interface AuthedRequest extends Request {
  auth?: {
    uid: string;
    role?: string;
    employeeId?: string;
    department?: string;
  };
}

/**
 * `Authorization: Bearer <Firebase ID token>` sarlavhasini tekshiradi va
 * `req.auth`ga custom-claims'larni yozadi. Cloud Functions'dagi avtomatik
 * `request.auth` o'rnini bosadi — endi buni qo'lda qilish kerak, chunki
 * Express o'zi Firebase bilan integratsiyalashmagan.
 */
export async function withAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthenticated", message: "Tizimga kirish talab qilinadi" });
  }
  try {
    // `checkRevoked: true` — aks holda ID token o'zining muddati (odatda 1
    // soatgacha) tugamaguncha, hatto revokeRefreshTokens() chaqirilgandan
    // keyin ham "yaroqli" deb hisoblanardi (imzo/muddat to'g'ri bo'lgani
    // uchun). Ishdan bo'shatish/PIN reset/kasb o'zgartirish darhol kuchga
    // kirishi uchun bu tekshiruv har bir so'rovda majburiy.
    const decoded = await auth.verifyIdToken(header.slice("Bearer ".length), true);
    req.auth = {
      uid: decoded.uid,
      role: decoded.role as string | undefined,
      employeeId: decoded.employeeId as string | undefined,
      department: decoded.department as string | undefined,
    };
    next();
  } catch {
    return res.status(401).json({ error: "unauthenticated", message: "Token yaroqsiz" });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin") {
    return res.status(403).json({ error: "permission-denied", message: "Faqat admin bu amalni bajara oladi" });
  }
  next();
}

/** onCall'dagi HttpsError o'rnini bosadi — route handlerlar shu klassni throw qiladi. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(res: Response, err: unknown) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "internal", message: "Server xatoligi yuz berdi" });
}

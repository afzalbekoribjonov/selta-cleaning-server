import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export function assertAdmin(request: CallableRequest): void {
  if (request.auth?.token?.role !== "admin") {
    throw new HttpsError("permission-denied", "Faqat admin bu amalni bajara oladi");
  }
}

export function assertSignedIn(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Tizimga kirish talab qilinadi");
  }
  return request.auth.uid;
}

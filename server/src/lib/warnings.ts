import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { notifyEmployee, notifyLater } from "./notifications";

/**
 * Xodimga ogohlantirish — tarix `warnings` jamlanmasida (faqat server),
 * hali ko'rilmaganlari xodim hujjatidagi `pendingWarnings` ro'yxatida
 * (ilova xodim hujjatini allaqachon jonli o'qiydi, qo'shimcha so'rov yo'q).
 * Xodim "Tanishdim" bosguncha ilovasida qizil oyna turadi.
 *
 * Nazoratchi qo'lda beradi (routes/supervisor.ts) va tizim o'zi beradi
 * (mahsulot qayta yuvishga qaytarilganda — uni yuvgan xodimga).
 */
export const MAX_WARNING_LENGTH = 500;
export const MAX_PENDING_WARNINGS = 10;

export class WarningTargetError extends Error {}

export async function issueWarning(input: {
  employeeId: string;
  text: string;
  createdBy: string;
  createdByName: string;
  /** Avtomatik ogohlantirish turi (masalan "rewash") — tarixda ajratish uchun. */
  kind?: string;
}): Promise<{ warningId: string; employeeName: string }> {
  const text = input.text.trim().slice(0, MAX_WARNING_LENGTH);
  const employeeRef = db.collection("employees").doc(input.employeeId);
  const warningRef = db.collection("warnings").doc();
  const at = Timestamp.now();

  const employeeName = await db.runTransaction(async (tx) => {
    const snap = await tx.get(employeeRef);
    const employee = snap.data();
    if (!snap.exists || employee?.status !== "active") {
      throw new WarningTargetError("Xodim topilmadi yoki ishdan bo'shatilgan");
    }
    const name = (employee.fullName as string | undefined) ?? "Xodim";
    tx.set(warningRef, {
      employeeId: input.employeeId,
      employeeName: name,
      text,
      kind: input.kind ?? "manual",
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: at,
      ackAt: null,
    });
    const pending = Array.isArray(employee.pendingWarnings) ? (employee.pendingWarnings as unknown[]) : [];
    const next = [...pending, { id: warningRef.id, text, byName: input.createdByName, at }].slice(-MAX_PENDING_WARNINGS);
    tx.update(employeeRef, { pendingWarnings: next });
    return name;
  });

  notifyLater(notifyEmployee(input.employeeId, "Ogohlantirish", text, { type: "warning", warningId: warningRef.id }));
  return { warningId: warningRef.id, employeeName };
}

/** Qayta yuvishga qaytarilgan mahsulot uchun yuvgan xodimga matn. */
export function rewashWarningText(subId: string, itemName: string, reason: string | null): string {
  const why = reason && reason.trim() ? ` Sabab: ${reason.trim()}.` : "";
  return (
    `#${subId} «${itemName}» sifat nazoratidan o'tmadi va qayta yuvishga qaytarildi.${why} ` +
    "Bu mahsulotni siz yuvgansiz — keyingi safar yuvishda jiddiy e'tibor bering. " +
    "Qayta yuvishga qaytgan har bir mahsulot hisobga olinadi."
  );
}

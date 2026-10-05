import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";

/**
 * Xodim ilovadan kiritgan chiqim (yoqilg'i, texnik xizmat, ...).
 *
 * Admin chiqimlari bilan BITTA `expenses` jamlanmasida turadi — oylik
 * hisobot va "Chiqimlar" sahifasi ularni ajratmasdan qo'shadi. Farqi:
 * `employeeId` va kun kaliti (`dateKey`) bor, va `fromCash` — pul
 * xodimning qo'lidagi (mijozlardan yig'ilgan) naqddan to'langan. Shunday
 * chiqim o'sha kuni xodim kassaga topshiradigan naqddan ayiriladi.
 */
export interface EmployeeExpense {
  id: string;
  employeeId: string;
  name: string;
  amount: number;
  note: string | null;
  fromCash: boolean;
  at: string | null;
}

/** Bir kunda xodimlar kiritgan chiqimlar (adminning o'z chiqimlari kirmaydi). */
export async function loadEmployeeExpenses(dateKey: string): Promise<EmployeeExpense[]> {
  const snap = await db.collection("expenses").where("dateKey", "==", dateKey).get();
  return snap.docs
    .map((doc) => {
      const e = doc.data();
      return {
        id: doc.id,
        employeeId: (e.employeeId as string | undefined) ?? "",
        name: (e.name as string | undefined) ?? "Chiqim",
        amount: (e.amount as number | undefined) ?? 0,
        note: (e.note as string | null | undefined) ?? null,
        fromCash: e.fromCash === true,
        at: e.date instanceof Timestamp ? e.date.toDate().toISOString() : null,
      };
    })
    .filter((e) => e.employeeId !== "")
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/** Har bir xodimning shu kuni QO'LIDAGI NAQDDAN qilgan chiqimlari yig'indisi. */
export function cashExpensesByEmployee(expenses: EmployeeExpense[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    if (e.fromCash) totals.set(e.employeeId, (totals.get(e.employeeId) ?? 0) + e.amount);
  }
  return totals;
}

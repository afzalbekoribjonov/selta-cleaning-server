import { Router } from "express";
import { db } from "../lib/admin";
import { sendError, withAuth, type AuthedRequest } from "../lib/authz";
import { BUILTIN_DEPARTMENT_LABELS } from "../lib/roles";

/**
 * Xodimlar ma'lumotnomasi ILOVA uchun — faqat ism va kasb (telefon, PIN,
 * maosh kabi maxfiy maydonlarsiz). Kerak bo'lgan joylar: buyurtma tarixida
 * "kim yuvdi / kim qadoqladi / kim olib keldi", qayta yuvishga qaytgan
 * mahsulotni kim yuvgani, joyida yuvish jamoasi a'zolari va ularning kasbi.
 *
 * Xodimlar boshqa xodimlar hujjatini o'qiy olmaydi (Firestore qoidasi), shuning
 * uchun ro'yxat server orqali beriladi. Ilova uni kuniga bir marta oladi va
 * qurilmada saqlaydi; server ham 5 daqiqa keshlaydi — o'qish juda kam.
 */
export const staffRouter = Router();

const BUILTIN: Record<string, string> = {
  dispatcher: "Sotuv menejeri",
  worker: "Ishchi",
  delivery: "Dastavchik",
  ...BUILTIN_DEPARTMENT_LABELS,
};

const TTL_MS = 5 * 60_000;
let cache: { at: number; body: unknown } | null = null;

export function invalidateStaffDirectory(): void {
  cache = null;
}

staffRouter.post("/staffDirectory", withAuth, async (_req: AuthedRequest, res) => {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      res.json(cache.body);
      return;
    }
    const [employeesSnap, customSnap] = await Promise.all([
      db.collection("employees").get(),
      db.collection("customDepartments").get(),
    ]);
    const custom = new Map(customSnap.docs.map((d) => [d.id, (d.data().label as string | undefined) ?? d.id]));

    const employees = employeesSnap.docs.map((d) => {
      const e = d.data();
      const department = (e.department as string) ?? "";
      return {
        id: d.id,
        fullName: (e.fullName as string) ?? "Xodim",
        department,
        departmentLabel: BUILTIN[department] ?? custom.get(department) ?? department,
        specializations: Array.isArray(e.specializations) ? e.specializations : [],
        canPack: e.canPack === true,
        active: e.status === "active",
      };
    });
    const body = { employees };
    cache = { at: Date.now(), body };
    res.json(body);
  } catch (err) {
    sendError(res, err);
  }
});

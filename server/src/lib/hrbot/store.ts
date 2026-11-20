import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../admin";

/**
 * HR boti ma'lumotlari — Firestore, faqat server o'qiydi/yozadi
 * (mijoz qoidalarida bu jamlanmalar yopiq):
 *
 *  - `hrVacancies/{id}`            — bo'sh ish o'rinlari (admin yaratadi);
 *  - `hrApplications/{id}`         — arizalar (nomzod ma'lumotlari va media);
 *  - `hrApplications/{id}/thread`  — admin xabarlari, savollar va javoblar;
 *  - `hrUsers/{telegramId}`        — har bir foydalanuvchining holati
 *                                    (qaysi qadamda, qoralama, ekran xabari).
 *
 * Media (video, rasm, ovoz) Telegram'ning o'zida qoladi: nomzod chatidagi
 * xabar ID'si (`copyMessage` bilan adminga tez ko'rsatish uchun) va
 * `file_id` (xabar o'chirilgan bo'lsa ham qayta yuborish uchun) saqlanadi.
 */

export type AppStatus = "new" | "reviewing" | "accepted" | "rejected";
export const APP_STATUSES: AppStatus[] = ["new", "reviewing", "accepted", "rejected"];

export type MediaKind = "video" | "video_note" | "photo" | "voice" | "audio" | "document" | "text";

export interface MediaRef {
  kind: MediaKind;
  chatId: number;
  messageId: number;
  fileId: string | null;
  duration: number | null;
}

export interface Vacancy {
  id: string;
  title: string;
  description: string;
  active: boolean;
  createdAt: Date;
}

export type Step = "name" | "age" | "phone" | "video" | "photo" | "voice";
export const STEPS: Step[] = ["name", "age", "phone", "video", "photo", "voice"];

export interface Draft {
  vacancyId: string;
  vacancyTitle: string;
  fullName: string | null;
  age: number | null;
  phone: string | null;
  video: MediaRef | null;
  photo: MediaRef | null;
  voice: MediaRef | null;
  /** Ko'rib chiqish ekranidan bitta maydonni qayta kiritmoqda — keyin ekranga qaytadi. */
  editing: boolean;
}

export type AdminAwait =
  | { kind: "message" | "question"; appId: string }
  | { kind: "vacTitle" }
  | { kind: "vacDesc"; vacId: string; isNew: boolean }
  | { kind: "editTitle"; vacId: string };

export interface HrUser {
  id: number;
  firstName: string;
  username: string | null;
  /** Ariza qadamlari: qaysi ma'lumot kutilmoqda; `review` — tekshirish ekrani. */
  step: Step | "review" | null;
  draft: Draft | null;
  /** Tugmali oxirgi bot xabari — navigatsiya shu xabarni tahrirlaydi. */
  screenId: number | null;
  /** Bo'sh o'rin ochilganda xabar olish. */
  notify: boolean;
  /** Admin: ko'rsatilgan media xabarlari (boshqa sahifaga o'tganda o'chiriladi). */
  media: number[];
  /** Admin: matn kutilmoqda (xabar, savol, ish o'rni nomi/tavsifi). */
  await: AdminAwait | null;
  /** Admin: oxirgi ochilgan ro'yxat ("n:0") — kartadan qaytish uchun. */
  lastList: string | null;
}

export interface Application {
  id: string;
  userId: number;
  username: string | null;
  vacancyId: string;
  vacancyTitle: string;
  fullName: string;
  age: number;
  phone: string;
  video: MediaRef;
  photo: MediaRef;
  voice: MediaRef;
  status: AppStatus;
  createdAt: Date;
  updatedAt: Date;
  threadCount: number;
  /** Javob kutilayotgan savollar. */
  openQuestions: number;
}

export type ThreadType = "message" | "question" | "answer" | "candidate";

export interface ThreadEntry {
  id: string;
  type: ThreadType;
  adminId: number | null;
  text: string;
  media: MediaRef | null;
  /** Javob — qaysi savolga. */
  questionId: string | null;
  /** Savol — nomzod chatidagi xabar ID'si (javob "reply" bilan bog'lanadi). */
  candidateMessageId: number | null;
  answered: boolean;
  at: Date;
}

const vacancies = () => db.collection("hrVacancies");
const applications = () => db.collection("hrApplications");
const users = () => db.collection("hrUsers");

const toDate = (v: unknown): Date => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(0));
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Firestore `undefined` qabul qilmaydi — chuqur tozalash. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v))) as T;
}

// ------------------------------------------------------------- FOYDALANUVCHI

export function emptyUser(id: number, firstName = "", username: string | null = null): HrUser {
  return { id, firstName, username, step: null, draft: null, screenId: null, notify: false, media: [], await: null, lastList: null };
}

export async function getUser(id: number): Promise<HrUser> {
  const snap = await users().doc(String(id)).get();
  if (!snap.exists) return emptyUser(id);
  const d = snap.data() ?? {};
  return {
    id,
    firstName: str(d.firstName) ?? "",
    username: str(d.username),
    step: (str(d.step) as HrUser["step"]) ?? null,
    draft: (d.draft as Draft | null) ?? null,
    screenId: num(d.screenId),
    notify: d.notify === true,
    media: Array.isArray(d.media) ? (d.media as number[]).filter((x) => typeof x === "number") : [],
    await: (d.await as AdminAwait | null) ?? null,
    lastList: str(d.lastList),
  };
}

export async function saveUser(user: HrUser): Promise<void> {
  await users().doc(String(user.id)).set({ ...clean(user), updatedAt: FieldValue.serverTimestamp() });
}

export async function notifySubscribers(): Promise<number[]> {
  const snap = await users().where("notify", "==", true).get();
  return snap.docs.map((d) => Number(d.id)).filter((x) => Number.isFinite(x));
}

// ------------------------------------------------------------ ISH O'RINLARI

function toVacancy(id: string, d: Record<string, unknown>): Vacancy {
  return {
    id,
    title: str(d.title) ?? "Lavozim",
    description: typeof d.description === "string" ? d.description : "",
    active: d.active !== false,
    createdAt: toDate(d.createdAt),
  };
}

/** O'chirilmaganlari, yaratilish tartibida. */
export async function listVacancies(onlyActive: boolean): Promise<Vacancy[]> {
  const snap = await vacancies().get();
  return snap.docs
    .filter((d) => d.data().deleted !== true)
    .map((d) => toVacancy(d.id, d.data()))
    .filter((v) => !onlyActive || v.active)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.title.localeCompare(b.title));
}

export async function getVacancy(id: string): Promise<Vacancy | null> {
  if (!id || id.includes("/")) return null;
  const snap = await vacancies().doc(id).get();
  const d = snap.data();
  if (!snap.exists || !d || d.deleted === true) return null;
  return toVacancy(snap.id, d);
}

export async function createVacancy(title: string, adminId: number): Promise<string> {
  const ref = vacancies().doc();
  await ref.set({
    title,
    description: "",
    active: true,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: adminId,
  });
  return ref.id;
}

/** Ish o'rnini butunlay o'chiradi (arizalar alohida — [deleteApplicationsOfVacancy]). */
export async function deleteVacancy(id: string): Promise<void> {
  if (!id || id.includes("/")) return;
  await vacancies().doc(id).delete();
}

export async function updateVacancy(id: string, patch: Partial<Pick<Vacancy, "title" | "description" | "active">>): Promise<void> {
  await vacancies().doc(id).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
}

// ------------------------------------------------------------------ ARIZALAR

function toMedia(v: unknown): MediaRef {
  const m = (v ?? {}) as Record<string, unknown>;
  return {
    kind: (str(m.kind) as MediaKind) ?? "document",
    chatId: num(m.chatId) ?? 0,
    messageId: num(m.messageId) ?? 0,
    fileId: str(m.fileId),
    duration: num(m.duration),
  };
}

function toApplication(id: string, d: Record<string, unknown>): Application {
  return {
    id,
    userId: num(d.userId) ?? 0,
    username: str(d.username),
    vacancyId: str(d.vacancyId) ?? "",
    vacancyTitle: str(d.vacancyTitle) ?? "Lavozim",
    fullName: str(d.fullName) ?? "Nomzod",
    age: num(d.age) ?? 0,
    phone: str(d.phone) ?? "",
    video: toMedia(d.video),
    photo: toMedia(d.photo),
    voice: toMedia(d.voice),
    status: (APP_STATUSES as string[]).includes(d.status as string) ? (d.status as AppStatus) : "new",
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    threadCount: num(d.threadCount) ?? 0,
    openQuestions: num(d.openQuestions) ?? 0,
  };
}

export async function createApplication(a: Omit<Application, "id" | "createdAt" | "updatedAt" | "threadCount" | "openQuestions" | "status">): Promise<string> {
  const ref = applications().doc();
  await ref.set({
    ...clean(a),
    status: "new",
    threadCount: 0,
    openQuestions: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getApplication(id: string): Promise<Application | null> {
  if (!id || id.includes("/")) return null;
  const snap = await applications().doc(id).get();
  return snap.exists ? toApplication(snap.id, snap.data() ?? {}) : null;
}

export async function setApplicationStatus(id: string, status: AppStatus, adminId: number): Promise<void> {
  await applications().doc(id).update({ status, statusBy: adminId, updatedAt: FieldValue.serverTimestamp() });
}

/** Yangidan eskiga (HR hajmi kichik — bitta so'rov, filtr xotirada). */
export async function listApplications(): Promise<Application[]> {
  const snap = await applications().orderBy("createdAt", "desc").limit(1000).get();
  return snap.docs.map((d) => toApplication(d.id, d.data()));
}

export async function applicationsOfUser(userId: number): Promise<Application[]> {
  const snap = await applications().where("userId", "==", userId).get();
  return snap.docs.map((d) => toApplication(d.id, d.data())).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// --------------------------------------------------------------- YOZISHMALAR

function toEntry(id: string, d: Record<string, unknown>): ThreadEntry {
  return {
    id,
    type: (str(d.type) as ThreadType) ?? "message",
    adminId: num(d.adminId),
    text: typeof d.text === "string" ? d.text : "",
    media: d.media ? toMedia(d.media) : null,
    questionId: str(d.questionId),
    candidateMessageId: num(d.candidateMessageId),
    answered: d.answered === true,
    at: toDate(d.at),
  };
}

export async function addThreadEntry(appId: string, entry: Omit<ThreadEntry, "id" | "at">): Promise<string> {
  const appRef = applications().doc(appId);
  const ref = appRef.collection("thread").doc();
  const batch = db.batch();
  batch.set(ref, { ...clean(entry), at: FieldValue.serverTimestamp() });
  const patch: Record<string, unknown> = { threadCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
  if (entry.type === "question") patch.openQuestions = FieldValue.increment(1);
  if (entry.type === "answer") patch.openQuestions = FieldValue.increment(-1);
  batch.update(appRef, patch);
  if (entry.type === "answer" && entry.questionId) {
    batch.update(appRef.collection("thread").doc(entry.questionId), { answered: true });
  }
  await batch.commit();
  return ref.id;
}

export async function listThread(appId: string): Promise<ThreadEntry[]> {
  const snap = await applications().doc(appId).collection("thread").orderBy("at", "asc").limit(200).get();
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

export async function getThreadEntry(appId: string, entryId: string): Promise<ThreadEntry | null> {
  if (!entryId || entryId.includes("/")) return null;
  const snap = await applications().doc(appId).collection("thread").doc(entryId).get();
  return snap.exists ? toEntry(snap.id, snap.data() ?? {}) : null;
}

// ------------------------------------------------------------ O'CHIRISH

/** Ariza va uning barcha yozishmalari butunlay o'chiriladi. */
export async function deleteApplication(id: string): Promise<void> {
  if (!id || id.includes("/")) return;
  const ref = applications().doc(id);
  const thread = await ref.collection("thread").get();
  // Batch chegarasi 500 — bo'lib yoziladi.
  for (let i = 0; i < thread.docs.length; i += 450) {
    const batch = db.batch();
    for (const d of thread.docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
  await ref.delete();
}

/** Lavozimning barcha arizalari; o'chirilganlar soni. */
export async function deleteApplicationsOfVacancy(vacancyId: string): Promise<number> {
  const snap = await applications().where("vacancyId", "==", vacancyId).get();
  for (const d of snap.docs) await deleteApplication(d.id);
  return snap.docs.length;
}

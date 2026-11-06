import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../admin";
import type { TgUser } from "./api";
import type { Script } from "./text";

/**
 * Botdan foydalanishi mumkin bo'lgan Telegram hisoblari — admin panel
 * "Sozlamalar" orqali kiritiladi (username yoki raqamli ID).
 *
 * Ro'yxat `telegramBot/config` hujjatida. Bu jamlanma Firestore
 * qoidalarida YO'Q, ya'ni ilovalar uni umuman o'qiy olmaydi — faqat
 * server (admin SDK). `settings/*` ga qo'yilmadi, chunki u barcha
 * xodimlarga o'qiladi.
 *
 * Username o'zgarishi yoki boshqa odamga o'tishi mumkin. Shuning uchun
 * username bo'yicha kiritilgan hisob birinchi marta yozganda uning
 * o'zgarmas raqamli ID'si bilan BOG'LANADI; shundan keyin faqat o'sha ID
 * o'tadi — username'ni keyin egallab olgan boshqa odam o'tmaydi.
 */

export interface BotUser {
  key: string;
  /** Kichik harflarda, "@" siz. */
  username: string | null;
  userId: number | null;
  label: string;
  lang: Script;
  addedAt: Date | null;
  linkedAt: Date | null;
  /** Bog'langan paytdagi Telegram ismi — admin panelda ko'rsatish uchun. */
  linkedName: string | null;
}

export const MAX_BOT_USERS = 20;
const configRef = () => db.collection("telegramBot").doc("config");

const CACHE_TTL_MS = 60_000;
let cache: { at: number; users: BotUser[] } | null = null;

export function invalidateBotUsersCache(): void {
  cache = null;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function parseUsers(raw: unknown): BotUser[] {
  if (!Array.isArray(raw)) return [];
  const users: BotUser[] = [];
  for (const u of raw) {
    if (!u || typeof u !== "object") continue;
    const r = u as Record<string, unknown>;
    const username = typeof r.username === "string" && r.username ? r.username.toLowerCase() : null;
    const userId = typeof r.userId === "number" && Number.isSafeInteger(r.userId) ? r.userId : null;
    if (!username && userId === null) continue;
    users.push({
      key: typeof r.key === "string" && r.key ? r.key : `${username ?? userId}`,
      username,
      userId,
      label: typeof r.label === "string" ? r.label : "",
      lang: r.lang === "cyrl" ? "cyrl" : "latn",
      addedAt: toDate(r.addedAt),
      linkedAt: toDate(r.linkedAt),
      linkedName: typeof r.linkedName === "string" ? r.linkedName : null,
    });
  }
  return users;
}

function serialize(u: BotUser): Record<string, unknown> {
  return {
    key: u.key,
    username: u.username,
    userId: u.userId,
    label: u.label,
    lang: u.lang,
    addedAt: u.addedAt ? Timestamp.fromDate(u.addedAt) : null,
    linkedAt: u.linkedAt ? Timestamp.fromDate(u.linkedAt) : null,
    linkedName: u.linkedName,
  };
}

/**
 * Ro'yxat (60 soniya keshda). O'qib bo'lmasa — oxirgi kesh, u ham
 * bo'lmasa bo'sh ro'yxat: shubhali holatda bot hech kimga javob bermaydi.
 */
export async function loadBotUsers(force = false): Promise<BotUser[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.users;
  try {
    const snap = await configRef().get();
    const users = parseUsers(snap.data()?.users);
    cache = { at: Date.now(), users };
    return users;
  } catch (err) {
    console.error("Telegram: ruxsat ro'yxatini o'qib bo'lmadi:", err);
    return cache?.users ?? [];
  }
}

/** "@Ali_Valiyev" / "ali_valiyev" / "123456789" -> tekshirilgan qiymat. */
export function parseIdentifier(raw: unknown): { username: string } | { userId: number } | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  if (/^\d{4,15}$/.test(value)) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? { userId: id } : null;
  }
  // Telegram username: 5–32 belgi, harf bilan boshlanadi, harf/raqam/_.
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)) return { username: value.toLowerCase() };
  return null;
}

/**
 * Xabar yuborgan odam ro'yxatdami. Avval raqamli ID (eng ishonchli),
 * keyin — hali bog'lanmagan yozuvlar orasidan username.
 */
export function matchBotUser(users: BotUser[], from: TgUser | undefined): BotUser | null {
  if (!from || from.is_bot || !Number.isSafeInteger(from.id)) return null;
  const byId = users.find((u) => u.userId === from.id);
  if (byId) return byId;
  const username = from.username?.toLowerCase();
  if (!username) return null;
  return users.find((u) => u.userId === null && u.username === username) ?? null;
}

function displayName(from: TgUser): string {
  return [from.first_name, from.last_name].filter(Boolean).join(" ").trim().slice(0, 80) || (from.username ?? String(from.id));
}

/**
 * Birinchi foydalanishda yozuvni hisobga bog'laydi: username bo'yicha
 * kiritilganini — ID'siga; ID bo'yicha kiritilganiga — Telegram ismini
 * yozib qo'yadi (admin panelda kimligi ko'rinsin). Bir marta yoziladi.
 */
export async function bindBotUser(key: string, from: TgUser): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef());
    const users = parseUsers(snap.data()?.users);
    const entry = users.find((u) => u.key === key);
    if (!entry) return;
    if (entry.userId !== null && (entry.userId !== from.id || entry.linkedAt)) return;
    // Shu ID boshqa yozuvga allaqachon bog'langan bo'lsa — ikkinchisini bog'lamaymiz.
    if (entry.userId === null && users.some((u) => u.userId === from.id)) return;
    entry.userId = from.id;
    entry.linkedAt = new Date();
    entry.linkedName = displayName(from);
    tx.set(configRef(), { users: users.map(serialize), updatedAt: Timestamp.now() }, { merge: true });
  });
  invalidateBotUsersCache();
}

/** Hisobot yozuvini (lotin/kirill) eslab qoladi — faqat o'zgargan bo'lsa yoziladi. */
export async function setBotUserLang(key: string, lang: Script): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef());
    const users = parseUsers(snap.data()?.users);
    const entry = users.find((u) => u.key === key);
    if (!entry || entry.lang === lang) return;
    entry.lang = lang;
    tx.set(configRef(), { users: users.map(serialize) }, { merge: true });
  });
  invalidateBotUsersCache();
}

export class BotUserError extends Error {}

export async function addBotUser(identifier: unknown, label: unknown): Promise<BotUser> {
  const parsed = parseIdentifier(identifier);
  if (!parsed) {
    throw new BotUserError(
      "Username (masalan @ali_valiyev, 5–32 belgi) yoki raqamli Telegram ID (masalan 123456789) kiriting",
    );
  }
  const cleanLabel = typeof label === "string" ? label.trim().slice(0, 60) : "";

  let created: BotUser | null = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef());
    const users = parseUsers(snap.data()?.users);
    if (users.length >= MAX_BOT_USERS) throw new BotUserError(`Ko'pi bilan ${MAX_BOT_USERS} ta hisob qo'shish mumkin`);
    const duplicate =
      "username" in parsed
        ? users.some((u) => u.username === parsed.username)
        : users.some((u) => u.userId === parsed.userId);
    if (duplicate) throw new BotUserError("Bu hisob ro'yxatda allaqachon bor");

    created = {
      key: randomUUID(),
      username: "username" in parsed ? parsed.username : null,
      userId: "userId" in parsed ? parsed.userId : null,
      label: cleanLabel,
      lang: "latn",
      addedAt: new Date(),
      linkedAt: null,
      linkedName: null,
    };
    users.push(created);
    tx.set(configRef(), { users: users.map(serialize), updatedAt: Timestamp.now() }, { merge: true });
  });
  invalidateBotUsersCache();
  return created!;
}

export async function removeBotUser(key: unknown): Promise<void> {
  if (typeof key !== "string" || !key) throw new BotUserError("Hisob tanlanmagan");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef());
    const users = parseUsers(snap.data()?.users);
    const next = users.filter((u) => u.key !== key);
    if (next.length === users.length) throw new BotUserError("Hisob topilmadi");
    tx.set(configRef(), { users: next.map(serialize), updatedAt: Timestamp.now() }, { merge: true });
  });
  invalidateBotUsersCache();
}

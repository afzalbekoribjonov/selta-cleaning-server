import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { ApiError, sendError, withAuth, requireAdmin, type AuthedRequest } from "../lib/authz";
import { loadEmployeeDirectory } from "../lib/employeeNames";
import {
  addBotUser,
  bindBotUser,
  BotUserError,
  loadBotUsers,
  removeBotUser,
  setBotUserLang,
  type BotUser,
} from "../lib/telegram/access";
import { httpTransport, TelegramApi, type TgUpdate } from "../lib/telegram/api";
import { createBot, type Bot } from "../lib/telegram/bot";
import { loadDayReport } from "../lib/telegram/dayReport";
import { findOrderByNumber, getOrderView } from "../lib/telegram/orderLookup";

/**
 * Telegram hisobot boti — shu Express serverning ichida ishlaydi (Render).
 *
 * Yangilanishlar WEBHOOK orqali keladi: server uxlab qolgan bo'lsa ham
 * Telegram so'rovi uni uyg'otadi, doimiy so'rov (polling) shart emas.
 *
 * Sozlash (Render → Environment):
 *  - TELEGRAM_BOT_TOKEN — BotFather bergan token (MAJBURIY, kodda saqlanmaydi);
 *  - TELEGRAM_WEBHOOK_SECRET — ixtiyoriy; berilmasa tokendan hosil qilinadi;
 *  - manzil Render'ning o'zi beradigan RENDER_EXTERNAL_URL dan olinadi
 *    (boshqa joyda — TELEGRAM_WEBHOOK_BASE_URL).
 *
 * Token bo'lmasa bot butunlay o'chiq — server odatdagidek ishlayveradi.
 */
export const telegramRouter = Router();

const WEBHOOK_PATH = "/telegram/webhook";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
const secret = token
  ? (process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || createHash("sha256").update(`selta-webhook:${token}`).digest("hex").slice(0, 48))
  : null;
const api = token ? new TelegramApi(httpTransport(token)) : null;

const bot: Bot | null = api
  ? createBot({
      api,
      loadUsers: () => loadBotUsers(),
      bindUser: bindBotUser,
      setUserLang: setBotUserLang,
      loadReport: loadDayReport,
      findOrderByNumber,
      getOrder: getOrderView,
      loadEmployees: loadEmployeeDirectory,
      now: () => new Date(),
    })
  : null;

function secretMatches(header: unknown): boolean {
  if (!secret || typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

telegramRouter.post(WEBHOOK_PATH, (req, res) => {
  if (!bot || !secretMatches(req.header("x-telegram-bot-api-secret-token"))) {
    res.status(404).end();
    return;
  }
  // Telegram'ga darhol javob — uzoq hisobot uni kutdirmasin (aks holda
  // u yangilanishni qayta yuboradi). Ishlov fonda, xatolari ushlanadi.
  res.status(200).json({ ok: true });
  const update = req.body as TgUpdate;
  bot.handleUpdate(update).catch((err) => console.error("Telegram: yangilanishni ishlab bo'lmadi:", err));
});

// ------------------------------------------------------------ ISHGA TUSHIRISH

let botUsername: string | null = null;

function webhookUrl(): string | null {
  const base = (process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  return base.startsWith("https://") ? `${base}${WEBHOOK_PATH}` : null;
}

/**
 * Server ishga tushganda: webhook'ni ro'yxatdan o'tkazadi va umumiy
 * buyruqlar menyusini tozalaydi (menyu faqat ruxsat berilgan chatlarda
 * ko'rinadi). Tarmoq xatosida bir necha marta qayta uriniladi; muvaffaqiyatsiz
 * bo'lsa ham server ishlashda davom etadi.
 */
export function startTelegramBot(): void {
  if (!api) {
    console.log("Telegram bot o'chiq: TELEGRAM_BOT_TOKEN berilmagan");
    return;
  }
  const url = webhookUrl();
  if (!url) {
    console.warn("Telegram bot: tashqi HTTPS manzil yo'q (RENDER_EXTERNAL_URL / TELEGRAM_WEBHOOK_BASE_URL) — webhook o'rnatilmadi");
    return;
  }

  const attempt = async (n: number): Promise<void> => {
    try {
      const me = await api.call<{ username?: string }>("getMe");
      botUsername = me.username ?? null;
      await api.call("setWebhook", {
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        max_connections: 20,
      });
      await api.call("deleteMyCommands", { scope: { type: "default" } }).catch(() => undefined);
      console.log(`Telegram bot @${botUsername ?? "?"} ishga tushdi, webhook: ${url}`);
    } catch (err) {
      console.error(`Telegram: webhook'ni o'rnatib bo'lmadi (urinish ${n}):`, err);
      if (n < 5) setTimeout(() => void attempt(n + 1), 15_000 * n);
    }
  };
  void attempt(1);
}

// -------------------------------------------------------------- ADMIN PANEL

function publicUser(u: BotUser) {
  return {
    key: u.key,
    username: u.username,
    userId: u.userId,
    label: u.label,
    lang: u.lang,
    addedAt: u.addedAt?.toISOString() ?? null,
    linkedAt: u.linkedAt?.toISOString() ?? null,
    linkedName: u.linkedName,
  };
}

/** Bot holati va ruxsat berilgan hisoblar. */
telegramRouter.post("/adminTelegramBot", withAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  try {
    const users = await loadBotUsers(true);
    let webhook: { ok: boolean; pendingUpdates: number; lastError: string | null; lastErrorAt: string | null } | null = null;
    if (api) {
      try {
        if (!botUsername) botUsername = (await api.call<{ username?: string }>("getMe")).username ?? null;
        const info = await api.call<{
          url?: string;
          pending_update_count?: number;
          last_error_date?: number;
          last_error_message?: string;
        }>("getWebhookInfo");
        webhook = {
          ok: !!info.url && info.url === webhookUrl(),
          pendingUpdates: info.pending_update_count ?? 0,
          lastError: info.last_error_message ?? null,
          lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
        };
      } catch (err) {
        console.error("Telegram: holatni olib bo'lmadi:", err);
      }
    }
    res.json({
      configured: !!api,
      botUsername,
      webhook,
      users: users.map(publicUser),
    });
  } catch (err) {
    sendError(res, err);
  }
});

function rethrow(err: unknown): never {
  if (err instanceof BotUserError) throw new ApiError(400, "invalid-argument", err.message);
  throw err;
}

telegramRouter.post("/adminTelegramAddUser", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const user = await addBotUser(req.body?.identifier, req.body?.label).catch(rethrow);
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    sendError(res, err);
  }
});

telegramRouter.post("/adminTelegramRemoveUser", withAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    await removeBotUser(req.body?.key).catch(rethrow);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

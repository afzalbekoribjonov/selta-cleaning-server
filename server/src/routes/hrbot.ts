import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { httpTransport, TelegramApi, type TgUpdate } from "../lib/telegram/api";
import { createHrBot, type HrBot } from "../lib/hrbot/bot";

/**
 * Selta Cleaning HR boti (ishga qabul) — hisobot boti kabi shu serverda,
 * webhook orqali ishlaydi.
 *
 * Sozlash (Render → Environment):
 *  - HR_BOT_TOKEN      — BotFather bergan token (MAJBURIY, kodda saqlanmaydi);
 *  - HR_BOT_ADMIN_IDS  — admin Telegram ID'lari, vergul bilan
 *                        ("111111111,222222222"); ular botda admin panelini ko'radi;
 *  - HR_BOT_WEBHOOK_SECRET — ixtiyoriy; berilmasa tokendan hosil qilinadi.
 *
 * Token bo'lmasa bot o'chiq — server odatdagidek ishlayveradi.
 */
export const hrBotRouter = Router();

const WEBHOOK_PATH = "/hrbot/webhook";

const token = process.env.HR_BOT_TOKEN?.trim() || null;
const adminIds = new Set(
  (process.env.HR_BOT_ADMIN_IDS ?? "")
    .split(/[\s,;]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isSafeInteger(n) && n > 0),
);
const secret = token
  ? (process.env.HR_BOT_WEBHOOK_SECRET?.trim() || createHash("sha256").update(`selta-hr-webhook:${token}`).digest("hex").slice(0, 48))
  : null;
const api = token ? new TelegramApi(httpTransport(token)) : null;
const bot: HrBot | null = api ? createHrBot({ api, adminIds }) : null;

function secretMatches(header: unknown): boolean {
  if (!secret || typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

hrBotRouter.post(WEBHOOK_PATH, (req, res) => {
  if (!bot || !secretMatches(req.header("x-telegram-bot-api-secret-token"))) {
    res.status(404).end();
    return;
  }
  res.status(200).json({ ok: true });
  bot.handleUpdate(req.body as TgUpdate).catch((err) => console.error("HR bot: yangilanishni ishlab bo'lmadi:", err));
});

function webhookUrl(): string | null {
  const base = (process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  return base.startsWith("https://") ? `${base}${WEBHOOK_PATH}` : null;
}

/** Server ishga tushganda: webhook, buyruqlar menyusi va bot tavsifi. */
export function startHrBot(): void {
  if (!api) {
    console.log("HR bot o'chiq: HR_BOT_TOKEN berilmagan");
    return;
  }
  if (adminIds.size === 0) console.warn("HR bot: HR_BOT_ADMIN_IDS berilmagan — admin paneli hech kimga ko'rinmaydi");
  const url = webhookUrl();
  if (!url) {
    console.warn("HR bot: tashqi HTTPS manzil yo'q — webhook o'rnatilmadi");
    return;
  }
  const attempt = async (n: number): Promise<void> => {
    try {
      const me = await api.call<{ username?: string }>("getMe");
      await api.call("setWebhook", {
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        max_connections: 20,
      });
      await Promise.all([
        api.call("setMyCommands", { commands: [{ command: "start", description: "Bosh menyu" }] }),
        api.call("setMyDescription", {
          description: "Selta Cleaning jamoasiga ishga qabul. Bo'sh ish o'rnini tanlang va arizangizni yuboring.",
        }),
        api.call("setMyShortDescription", { short_description: "Selta Cleaning · Ishga qabul" }),
      ]).catch((err) => console.warn("HR bot: menyu/tavsifni o'rnatib bo'lmadi:", err));
      console.log(`HR bot @${me.username ?? "?"} ishga tushdi, webhook: ${url}, adminlar: ${adminIds.size}`);
    } catch (err) {
      console.error(`HR bot: webhook'ni o'rnatib bo'lmadi (urinish ${n}):`, err);
      if (n < 5) setTimeout(() => void attempt(n + 1), 15_000 * n);
    }
  };
  void attempt(1);
}

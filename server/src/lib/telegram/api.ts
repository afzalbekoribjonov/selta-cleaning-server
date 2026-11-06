import https from "node:https";

/**
 * Telegram Bot API'ning juda yupqa mijozi — tashqi kutubxonasiz, Node'ning
 * o'z `https` moduli bilan (IPv4, doimiy ulanish — pastda `agent`).
 *
 * Ishonchlilik qoidalari:
 *  - har bir so'rovga vaqt chegarasi (osilib qolgan ulanish botni
 *    to'xtatmasin);
 *  - 429 (juda tez) — Telegram aytgan `retry_after` kutib qayta urinadi;
 *  - tarmoq xatosi — 1, 2, 4 soniya kutib 3 marta, 5xx — 2 marta qayta
 *    urinadi;
 *  - "message is not modified" — xato emas (foydalanuvchi bir tugmani ikki
 *    marta bosgan), jim o'tkazib yuboriladi.
 *
 * Transport tashqaridan almashtiriladi — sinovlarda haqiqiy Telegram'ga
 * so'rov ketmaydi.
 */

export interface InlineButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineButton[][];

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export type Transport = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    readonly description: string,
    readonly retryAfter: number | null = null,
  ) {
    super(`Telegram ${method}: ${code} ${description}`);
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Telegram'ga ulanish — FAQAT IPv4, doimiy (keep-alive) ulanish bilan.
 *
 * NEGA `fetch` emas: Node 20 `fetch` IPv6 va IPv4 manzillarini navbatma-
 * navbat sinaydi va har biriga atigi 250 ms beradi. Render (Singapur)
 * dan Telegram serverlarigacha (Yevropa) ulanish bundan uzoqroq —
 * ikkala urinish ham "vaqt tugadi" (ETIMEDOUT) bo'lib qolardi, garchi
 * Telegram ishlab turgan bo'lsa ham. IPv4 bilan bunday cheklov yo'q;
 * doimiy ulanish esa hisobotning 6+ xabarini bitta ulanish orqali
 * yuboradi (har biriga yangi ulanish ochilmaydi).
 */
const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30_000, maxSockets: 8, family: 4 });

function postJson(url: string, payload: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent,
        family: 4,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error("Telegram so'rovi vaqti tugadi")));
    req.on("error", reject);
    req.end(payload);
  });
}

/** Haqiqiy HTTPS transport. */
export function httpTransport(token: string): Transport {
  return async (method, params) => {
    const response = await postJson(`https://api.telegram.org/bot${token}/${method}`, JSON.stringify(params));
    let body: { ok?: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } };
    try {
      body = JSON.parse(response.text) as typeof body;
    } catch {
      throw new TelegramError(method, response.status, "javob JSON emas");
    }
    if (!body.ok) {
      throw new TelegramError(
        method,
        body.error_code ?? response.status,
        body.description ?? "noma'lum xato",
        body.parameters?.retry_after ?? null,
      );
    }
    return body.result;
  };
}

export class TelegramApi {
  constructor(private readonly transport: Transport) {}

  /** Qayta urinishlar bilan chaqiruv. */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return (await this.transport(method, params)) as T;
      } catch (err) {
        attempt += 1;
        if (err instanceof TelegramError) {
          if (err.code === 429 && attempt <= 3) {
            await sleep(Math.min((err.retryAfter ?? 1) * 1000, 30_000));
            continue;
          }
          if (err.code >= 500 && attempt <= 2) {
            await sleep(700 * attempt);
            continue;
          }
          throw err;
        }
        // Tarmoq xatosi yoki vaqt tugashi — 1, 2, 4 soniyadan keyin qayta.
        if (attempt <= 3) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
    }
  }

  sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<TgMessage> {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  /** Xabarni tahrirlaydi; o'zgarmagan bo'lsa jim o'tadi. */
  async editMessage(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    try {
      await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: keyboard ?? [] },
      });
    } catch (err) {
      if (err instanceof TelegramError && /message is not modified/i.test(err.description)) return;
      throw err;
    }
  }

  /** Tugma bosilganini tasdiqlaydi (soat belgisi yo'qoladi). Xatosi muhim emas. */
  async answerCallback(callbackId: string, text?: string): Promise<void> {
    try {
      await this.call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
    } catch {
      // Eskirgan tugma (48 soatdan oshgan) — e'tiborsiz.
    }
  }

  /** "yozmoqda..." belgisi. Xatosi muhim emas. */
  async typing(chatId: number): Promise<void> {
    try {
      await this.call("sendChatAction", { chat_id: chatId, action: "typing" });
    } catch {
      // ahamiyatsiz
    }
  }
}

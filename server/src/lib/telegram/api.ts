/**
 * Telegram Bot API'ning juda yupqa mijozi — tashqi kutubxonasiz, Node 20
 * ichidagi `fetch` bilan.
 *
 * Ishonchlilik qoidalari:
 *  - har bir so'rovga vaqt chegarasi (osilib qolgan ulanish botni
 *    to'xtatmasin);
 *  - 429 (juda tez) — Telegram aytgan `retry_after` kutib qayta urinadi;
 *  - tarmoq xatosi va 5xx — qisqa kutish bilan 2 marta qayta urinadi;
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

const REQUEST_TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Haqiqiy HTTPS transport. */
export function httpTransport(token: string): Transport {
  return async (method, params) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      let body: { ok?: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } };
      try {
        body = (await response.json()) as typeof body;
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
    } finally {
      clearTimeout(timer);
    }
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
        // Tarmoq xatosi yoki vaqt tugashi.
        if (attempt <= 2) {
          await sleep(700 * attempt);
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

import { TelegramError, type InlineButton, type InlineKeyboard, type TelegramApi } from "../telegram/api";
export type { InlineKeyboard };
import type { HrUser, MediaRef } from "./store";

/**
 * Chat tartibi: har bir foydalanuvchida bitta "ekran" xabari (tugmali).
 * Navigatsiya shu xabarni TAHRIRLAYDI; yangi xabar faqat kerak bo'lganda
 * (masalan nomzod media yuborgach, savol pastda turishi uchun) yuboriladi
 * va eskisi o'chiriladi. Shunda chatda keraksiz xabarlar to'planmaydi.
 */
export interface HrContext {
  api: TelegramApi;
  adminIds: Set<number>;
}

export const btn = (text: string, data: string): InlineButton => ({ text, callback_data: data });

/** Ekranni yangilaydi: tahrirlab bo'lmasa — eskisini o'chirib, yangisini yuboradi. */
export async function show(ctx: HrContext, user: HrUser, text: string, keyboard: InlineKeyboard = []): Promise<void> {
  if (user.screenId) {
    try {
      await ctx.api.editMessage(user.id, user.screenId, text, keyboard);
      return;
    } catch {
      // Xabar o'chirilgan, juda eski yoki tahrirlanmaydigan turda — yangisi yuboriladi.
    }
  }
  await showAtBottom(ctx, user, text, keyboard);
}

/** Ekranni chat oxiriga qo'yadi (eskisi o'chiriladi). */
export async function showAtBottom(ctx: HrContext, user: HrUser, text: string, keyboard: InlineKeyboard = []): Promise<void> {
  const old = user.screenId;
  user.screenId = null;
  await ctx.api.deleteMessage(user.id, old);
  const m = await ctx.api.sendMessage(user.id, text, keyboard.length ? keyboard : undefined);
  user.screenId = m.message_id;
}

/** Pastki (reply) klaviatura bilan ekran — faqat telefon raqami so'ralganda. */
export async function showWithReplyKeyboard(ctx: HrContext, user: HrUser, text: string, rows: { text: string; request_contact?: boolean }[][]): Promise<void> {
  const old = user.screenId;
  user.screenId = null;
  await ctx.api.deleteMessage(user.id, old);
  const m = await ctx.api.call<{ message_id: number }>("sendMessage", {
    chat_id: user.id,
    text,
    parse_mode: "HTML",
    reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true, input_field_placeholder: "+998 90 123 45 67" },
  });
  user.screenId = m.message_id;
}

/** Pastki klaviaturani yopadi (yordamchi xabar darhol o'chiriladi). */
export async function removeReplyKeyboard(ctx: HrContext, chatId: number): Promise<void> {
  try {
    const m = await ctx.api.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: "✔️",
      reply_markup: { remove_keyboard: true },
    });
    await ctx.api.deleteMessage(chatId, m.message_id);
  } catch {
    // ahamiyatsiz
  }
}

/** Foydalanuvchi botni bloklagan / chat topilmadi. */
export function isUnreachable(err: unknown): boolean {
  return err instanceof TelegramError && (err.code === 403 || /chat not found|user is deactivated|bot was blocked/i.test(err.description));
}

const SEND_BY_KIND: Record<string, [string, string]> = {
  video: ["sendVideo", "video"],
  video_note: ["sendVideoNote", "video_note"],
  photo: ["sendPhoto", "photo"],
  voice: ["sendVoice", "voice"],
  audio: ["sendAudio", "audio"],
  document: ["sendDocument", "document"],
};

/**
 * Media'ni boshqa chatga ko'rsatadi: avval asl xabar nusxasi (tez,
 * hajm cheklovsiz), u o'chirilgan bo'lsa — saqlangan `file_id` orqali.
 * Yuborilgan xabar ID'sini qaytaradi; ikkalasi ham bo'lmasa — null.
 */
export async function deliverMedia(
  ctx: HrContext,
  toChatId: number,
  media: MediaRef,
  caption: string,
  keyboard?: InlineKeyboard,
): Promise<number | null> {
  // Dumaloq video va matnda izoh bo'lmaydi — izoh alohida, oldinroq.
  const withCaption = media.kind !== "video_note" && media.kind !== "text";
  if (!withCaption && caption) await ctx.api.sendMessage(toChatId, caption).catch(() => undefined);
  try {
    return await ctx.api.copyMessage(toChatId, media.chatId, media.messageId, withCaption ? caption : undefined, keyboard);
  } catch {
    // Asl xabar o'chirilgan — saqlangan file_id bilan.
  }
  const how = SEND_BY_KIND[media.kind];
  if (!how || !media.fileId) return null;
  try {
    const m = await ctx.api.call<{ message_id: number }>(how[0], {
      chat_id: toChatId,
      [how[1]]: media.fileId,
      ...(withCaption ? { caption, parse_mode: "HTML" } : {}),
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
    return m.message_id;
  } catch {
    return null;
  }
}

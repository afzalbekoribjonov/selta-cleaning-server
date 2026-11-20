import type { TgUpdate } from "../telegram/api";
import { handleAdminCallback, handleAdminMessage } from "./admin";
import { handleCandidateCallback, handleCandidateMessage } from "./candidate";
import type { HrContext } from "./screen";
import { getUser, saveUser } from "./store";

export interface HrBot {
  handleUpdate(update: TgUpdate): Promise<void>;
}

/**
 * HR boti: yangilanishni nomzod yoki admin qismiga yo'naltiradi.
 *
 * Bir foydalanuvchining yangilanishlari NAVBAT bilan ishlanadi (webhook
 * bir vaqtda bir nechta so'rov yuborishi mumkin — masalan nomzod ketma-ket
 * ikki xabar yuborsa, ikkinchisi birinchisining holatini bosib ketmasin).
 * Holat faqat o'zgargan bo'lsa yoziladi.
 */
export function createHrBot(ctx: HrContext): HrBot {
  const queues = new Map<number, Promise<void>>();

  async function process(update: TgUpdate): Promise<void> {
    const msg = update.message;
    const cb = update.callback_query;
    const from = msg?.from ?? cb?.from;
    if (!from || from.is_bot) return;
    const chatType = msg?.chat.type ?? cb?.message?.chat.type ?? "private";
    if (chatType !== "private") return;

    const user = await getUser(from.id);
    const before = JSON.stringify(user);
    user.firstName = from.first_name ?? user.firstName;
    user.username = from.username ?? null;
    const isAdmin = ctx.adminIds.has(from.id);

    try {
      if (cb) {
        await ctx.api.answerCallback(cb.id);
        const data = cb.data ?? "";
        const pressed = cb.message;
        // Boshqa xabardagi tugma (masalan xabarnoma): matnli bo'lsa — o'sha
        // xabar endi ekran, eskisi o'chadi; media bo'lsa — ekran pastda yangidan.
        if (pressed && pressed.message_id !== user.screenId) {
          await ctx.api.deleteMessage(from.id, user.screenId);
          user.screenId = typeof pressed.text === "string" ? pressed.message_id : null;
        }
        if (data.startsWith("a:")) {
          if (isAdmin) await handleAdminCallback(ctx, user, data);
        } else if (data.startsWith("c:")) {
          await handleCandidateCallback(ctx, user, data);
        }
      } else if (msg) {
        if (isAdmin) await handleAdminMessage(ctx, user, msg);
        else await handleCandidateMessage(ctx, user, msg);
      }
    } catch (err) {
      console.error("HR bot: yangilanishni ishlab bo'lmadi:", err);
      await ctx.api.sendMessage(from.id, "⚠️ Xatolik yuz berdi. Qaytadan urinib ko'ring.").catch(() => undefined);
    } finally {
      if (JSON.stringify(user) !== before) await saveUser(user);
    }
  }

  return {
    async handleUpdate(update) {
      const id = update.message?.from?.id ?? update.callback_query?.from.id;
      if (!id) return;
      const previous = queues.get(id) ?? Promise.resolve();
      const run = previous.then(() => process(update)).catch((err) => console.error("HR bot:", err));
      queues.set(id, run);
      await run;
      if (queues.get(id) === run) queues.delete(id);
    },
  };
}

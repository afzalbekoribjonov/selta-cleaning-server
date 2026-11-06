import { businessDateString, businessDayRangeUtc } from "../businessTime";
import type { EmployeeInfo } from "../employeeNames";
import { matchBotUser, type BotUser } from "./access";
import type { InlineKeyboard, TelegramApi, TgCallbackQuery, TgMessage, TgUpdate, TgUser } from "./api";
import type { DayReport } from "./dayReport";
import { findItem, renderItem, renderOrder, type OrderView } from "./orderLookup";
import { renderDayReport } from "./reportMessages";
import { dateTime, dayMonth, esc, inScript, type Script } from "./text";

/**
 * Bot mantig'i. Barcha tashqi narsa (Telegram, Firestore) `BotDeps`
 * orqali beriladi — sinovda soxtasi qo'yiladi.
 *
 * Qoidalar:
 *  - faqat shaxsiy chat; guruh, kanal va boshqa yangilanishlar e'tiborsiz;
 *  - ro'yxatda bo'lmagan hisobga HECH QANDAY javob yo'q (talab);
 *  - bitta chatning yangilanishlari navbat bilan, ketma-ket ishlanadi —
 *    xabarlar tartibi buzilmaydi;
 *  - har qanday xato shu yangilanish bilan cheklanadi: bot to'xtamaydi.
 */

export interface BotDeps {
  api: TelegramApi;
  loadUsers(): Promise<BotUser[]>;
  bindUser(key: string, from: TgUser): Promise<void>;
  setUserLang(key: string, lang: Script): Promise<void>;
  loadReport(dateKey: string): Promise<DayReport>;
  findOrderByNumber(orderNumber: number): Promise<OrderView | null>;
  getOrder(orderId: string, force?: boolean): Promise<OrderView | null>;
  loadEmployees(): Promise<Map<string, EmployeeInfo>>;
  now(): Date;
  /** Hisobot xabarlari orasidagi pauza (Telegram cheklovi); sinovda 0. */
  messageGapMs?: number;
  log?(message: string, err?: unknown): void;
}

export interface Bot {
  handleUpdate(update: TgUpdate): Promise<void>;
  /** Sinovlar uchun: fondagi hisobotlar tugashini kutish. */
  idle(): Promise<void>;
}

const AWAIT_ID_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createBot(deps: BotDeps): Bot {
  const log = deps.log ?? ((message: string, err?: unknown) => console.error(`Telegram: ${message}`, err ?? ""));
  const gap = deps.messageGapMs ?? 400;

  const seenUpdates = new Set<number>();
  const chatQueues = new Map<number, Promise<void>>();
  const awaitingId = new Map<number, number>();
  const reportsRunning = new Set<number>();
  const commandsSetFor = new Set<number>();
  const background = new Set<Promise<void>>();

  // ------------------------------------------------------------ YORDAMCHI

  const say = (chatId: number, text: string, script: Script, keyboard?: InlineKeyboard) =>
    deps.api.sendMessage(chatId, inScript(text, script), keyboard);

  async function nameResolver(): Promise<(id: string | null) => string | null> {
    let employees = new Map<string, EmployeeInfo>();
    try {
      employees = await deps.loadEmployees();
    } catch (err) {
      log("xodimlar ro'yxatini o'qib bo'lmadi", err);
    }
    return (id) => {
      if (!id) return null;
      return employees.get(id)?.name ?? "Admin";
    };
  }

  function runInBackground(task: () => Promise<void>) {
    const p = task()
      .catch((err) => log("fon vazifasi xatosi", err))
      .finally(() => background.delete(p));
    background.add(p);
  }

  // ---------------------------------------------------------- BUYRUQLAR

  async function onStart(chatId: number, from: TgUser, user: BotUser) {
    const name = esc(from.first_name || from.username || "");
    const text = [
      `👋 Assalomu alaykum${name ? `, <b>${name}</b>` : ""}!`,
      `Men <b>Selta Cleaning</b> hisobot botiman. Sizga quyidagilarni tayyorlab beraman:`,
      [
        "• kunlik hisobot va kassa",
        "• yuvilgan mahsulotlar hajmi va narxi",
        "• tariflar va mahsulot nomlari bo'yicha ko'rsatkichlar",
        "• xodimlar faolligi — sotuv menejerlari, ishchilar, dastavchiklar",
        "• buyurtma va har bir mahsulot tafsilotlari",
      ].join("\n"),
      [
        "<b>Buyruqlar</b>",
        "/hisobot — bugungi hisobot",
        "/hisobot kecha — kechagi hisobot",
        "/id — buyurtmani ID raqami orqali topish",
      ].join("\n"),
      "<i>Hisobotni lotin yoki kirill yozuvida olishingiz mumkin.</i>",
    ].join("\n\n");
    await say(chatId, text, user.lang);

    // Buyruqlar menyusi — faqat ruxsat berilgan chatda ko'rinadi.
    if (!commandsSetFor.has(chatId)) {
      try {
        await deps.api.call("setMyCommands", {
          scope: { type: "chat", chat_id: chatId },
          commands: [
            { command: "hisobot", description: inScript("Kunlik hisobot", user.lang) },
            { command: "id", description: inScript("Buyurtmani ID orqali topish", user.lang) },
          ],
        });
        commandsSetFor.add(chatId);
      } catch (err) {
        log("buyruqlar menyusini o'rnatib bo'lmadi", err);
      }
    }
  }

  /** "/hisobot", "/hisobot kecha", "/hisobot 2026-11-05", "/hisobot 05.11.2026". */
  function parseReportDate(arg: string): string | null | "invalid" {
    const now = deps.now();
    const today = businessDateString(now);
    const a = arg.trim().toLowerCase();
    if (!a || a === "bugun" || a === "бугун") return today;
    if (a === "kecha" || a === "кеча") return businessDateString(new Date(businessDayRangeUtc(today)!.start.getTime() - 12 * 3_600_000));
    let key: string | null = null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
    const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(a);
    if (iso) key = a;
    else if (dotted) key = `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
    if (!key || !businessDayRangeUtc(key) || key > today) return "invalid";
    return key;
  }

  async function onReportCommand(chatId: number, arg: string, user: BotUser) {
    const dateKey = parseReportDate(arg);
    if (dateKey === "invalid" || dateKey === null) {
      await say(
        chatId,
        "⚠️ Sana noto'g'ri. Masalan: <code>/hisobot</code>, <code>/hisobot kecha</code> yoki <code>/hisobot 05.11.2026</code>.",
        user.lang,
      );
      return;
    }
    const today = businessDateString(deps.now());
    const label = dateKey === today ? "Bugungi" : `${dayMonth(new Date(businessDayRangeUtc(dateKey)!.start.getTime() + 12 * 3_600_000))} kungi`;
    await deps.api.sendMessage(chatId, inScript(`📊 <b>${label} hisobot</b>\nQaysi yozuvda yuboray?`, user.lang), [
      [
        { text: "🇺🇿 O'zbekcha (lotin)", callback_data: `h:latn:${dateKey}` },
        { text: "🇺🇿 Ўзбекча (кирилл)", callback_data: `h:cyrl:${dateKey}` },
      ],
    ]);
  }

  async function sendReport(chatId: number, promptId: number | null, script: Script, dateKey: string) {
    const edit = async (text: string, keyboard?: InlineKeyboard) => {
      if (promptId === null) return;
      try {
        await deps.api.editMessage(chatId, promptId, inScript(text, script), keyboard);
      } catch (err) {
        log("hisobot so'rovini tahrirlab bo'lmadi", err);
      }
    };

    await edit("⏳ <b>Hisobot tayyorlanmoqda…</b>\nBir necha soniya kuting.");
    await deps.api.typing(chatId);

    let messages: string[][];
    try {
      messages = renderDayReport(await deps.loadReport(dateKey), script);
    } catch (err) {
      log(`hisobotni tayyorlab bo'lmadi (${dateKey})`, err);
      await edit("⚠️ <b>Hisobotni tayyorlab bo'lmadi.</b>\nBirozdan keyin qayta urinib ko'ring.", [
        [{ text: inScript("🔄 Qayta urinish", script), callback_data: `h:${script}:${dateKey}` }],
      ]);
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const group of messages) {
      for (const text of group) {
        try {
          if (sent + failed > 0 && gap > 0) await sleep(gap);
          await deps.api.sendMessage(chatId, text);
          sent += 1;
        } catch (err) {
          failed += 1;
          log("hisobot xabarini yuborib bo'lmadi", err);
        }
      }
    }
    const at = dateTime(deps.now());
    await edit(
      failed === 0
        ? `✅ <b>Hisobot yuborildi</b> · ${at}`
        : `⚠️ Hisobotning ${failed} ta xabari yuborilmadi · ${at}`,
      failed === 0 ? undefined : [[{ text: inScript("🔄 Qayta yuborish", script), callback_data: `h:${script}:${dateKey}` }]],
    );
  }

  async function askOrderId(chatId: number, user: BotUser) {
    awaitingId.set(chatId, Date.now() + AWAIT_ID_MS);
    await say(
      chatId,
      "🔎 <b>Buyurtma ID raqamini yuboring</b>\nMasalan: <code>1245</code>\n\n<i>Mahsulotni to'g'ridan-to'g'ri ochish uchun: <code>1245/2</code></i>",
      user.lang,
    );
  }

  async function lookup(chatId: number, raw: string, user: BotUser) {
    const match = /^#?\s*(\d{1,9})(?:\s*\/\s*(\d{1,4}))?$/.exec(raw.trim());
    if (!match) {
      await say(chatId, "⚠️ ID raqam faqat sonlardan iborat bo'lishi kerak.\nMasalan: <code>1245</code> yoki <code>1245/2</code>", user.lang);
      return;
    }
    const orderNumber = Number(match[1]);
    const itemNumber = match[2] ? Number(match[2]) : null;

    await deps.api.typing(chatId);
    let order: OrderView | null;
    try {
      order = await deps.findOrderByNumber(orderNumber);
    } catch (err) {
      log(`buyurtmani o'qib bo'lmadi (#${orderNumber})`, err);
      await say(chatId, "⚠️ Ma'lumotni olib bo'lmadi. Birozdan keyin qayta urinib ko'ring.", user.lang);
      return;
    }
    if (!order) {
      await say(chatId, `❌ <b>#${orderNumber}</b> raqamli buyurtma topilmadi.\nRaqamni tekshirib, qayta yuboring.`, user.lang);
      return;
    }
    awaitingId.delete(chatId);

    const nameOf = await nameResolver();
    if (itemNumber !== null) {
      const item = order.items.find((i) => i.itemNumber === itemNumber);
      if (item) {
        const view = renderItem(order, item, nameOf, user.lang);
        await deps.api.sendMessage(chatId, view.text, view.keyboard);
        return;
      }
      await say(chatId, `ℹ️ #${orderNumber} buyurtmada ${itemNumber}-mahsulot yo'q. Buyurtmaning o'zi:`, user.lang);
    }
    const view = renderOrder(order, nameOf, user.lang, deps.now());
    await deps.api.sendMessage(chatId, view.text, view.keyboard);
  }

  async function help(chatId: number, user: BotUser) {
    await say(
      chatId,
      "ℹ️ <b>Buyruqlar</b>\n/hisobot — bugungi hisobot\n/hisobot kecha — kechagi hisobot\n/id — buyurtmani ID raqami orqali topish",
      user.lang,
    );
  }

  // ------------------------------------------------------------- XABARLAR

  async function onMessage(message: TgMessage, user: BotUser) {
    const chatId = message.chat.id;
    const text = (message.text ?? "").trim();
    if (!text) {
      await help(chatId, user);
      return;
    }

    const command = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text);
    if (command) {
      const name = command[1].toLowerCase();
      const arg = (command[2] ?? "").trim();
      if (name !== "id") awaitingId.delete(chatId);
      switch (name) {
        case "start":
          await onStart(chatId, message.from!, user);
          return;
        case "hisobot":
        case "report":
          await onReportCommand(chatId, arg, user);
          return;
        case "id":
          if (arg) await lookup(chatId, arg, user);
          else await askOrderId(chatId, user);
          return;
        case "bekor":
        case "cancel":
          await say(chatId, "✅ Bekor qilindi.", user.lang);
          return;
        default:
          await help(chatId, user);
          return;
      }
    }

    // Raqam yuborilsa — har doim buyurtma qidiruvi (/id kutilmasa ham).
    if (/^#?\s*\d{1,9}(\s*\/\s*\d{1,4})?$/.test(text)) {
      await lookup(chatId, text, user);
      return;
    }

    const waiting = awaitingId.get(chatId);
    if (waiting && waiting > Date.now()) {
      await lookup(chatId, text, user);
      return;
    }
    awaitingId.delete(chatId);
    await help(chatId, user);
  }

  // -------------------------------------------------------- TUGMALAR

  async function onCallback(cb: TgCallbackQuery, user: BotUser) {
    const data = cb.data ?? "";
    const message = cb.message;
    if (!message) {
      await deps.api.answerCallback(cb.id);
      return;
    }
    const chatId = message.chat.id;

    // --- Hisobot ---
    const report = /^h:(latn|cyrl):(\d{4}-\d{2}-\d{2})$/.exec(data);
    if (report) {
      const script = report[1] as Script;
      const dateKey = report[2];
      if (reportsRunning.has(chatId)) {
        await deps.api.answerCallback(cb.id, inScript("⏳ Hisobot tayyorlanmoqda…", script));
        return;
      }
      await deps.api.answerCallback(cb.id);
      reportsRunning.add(chatId);
      if (user.lang !== script) {
        user.lang = script;
        deps.setUserLang(user.key, script).catch((err) => log("yozuv tanlovini saqlab bo'lmadi", err));
      }
      // Fonda: shu chatdagi boshqa tugmalar hisobotni kutib qolmasin.
      runInBackground(async () => {
        try {
          await sendReport(chatId, message.message_id, script, dateKey);
        } finally {
          reportsRunning.delete(chatId);
        }
      });
      return;
    }

    // --- Buyurtma / mahsulot ---
    const orderMatch = /^([ori]):([A-Za-z0-9_-]+)(?::(.+))?$/.exec(data);
    const kind = orderMatch?.[1] ?? "";
    if (!orderMatch) {
      await deps.api.answerCallback(cb.id);
      return;
    }
    const orderId = orderMatch[2];
    const force = kind === "r";

    let order: OrderView | null;
    try {
      order = await deps.getOrder(orderId, force);
    } catch (err) {
      log(`buyurtmani o'qib bo'lmadi (${orderId})`, err);
      await deps.api.answerCallback(cb.id, inScript("⚠️ Ma'lumotni olib bo'lmadi, qayta urinib ko'ring", user.lang));
      return;
    }
    if (!order) {
      await deps.api.answerCallback(cb.id);
      await deps.api.editMessage(chatId, message.message_id, inScript("❌ Buyurtma topilmadi — o'chirilgan bo'lishi mumkin.", user.lang));
      return;
    }

    const nameOf = await nameResolver();
    if (kind === "i") {
      const item = findItem(order, orderMatch[3] ?? "");
      if (!item) {
        // Mahsulot o'chirilgan — buyurtmaning yangilangan ko'rinishi.
        await deps.api.answerCallback(cb.id, inScript("Bu mahsulot endi buyurtmada yo'q", user.lang));
        const fresh = (await deps.getOrder(orderId, true)) ?? order;
        const view = renderOrder(fresh, nameOf, user.lang, deps.now());
        await deps.api.editMessage(chatId, message.message_id, view.text, view.keyboard);
        return;
      }
      await deps.api.answerCallback(cb.id);
      const view = renderItem(order, item, nameOf, user.lang);
      await deps.api.editMessage(chatId, message.message_id, view.text, view.keyboard);
      return;
    }

    await deps.api.answerCallback(cb.id, force ? inScript(`🔄 Yangilandi · ${dateTime(deps.now())}`, user.lang) : undefined);
    const view = renderOrder(order, nameOf, user.lang, deps.now());
    await deps.api.editMessage(chatId, message.message_id, view.text, view.keyboard);
  }

  // ------------------------------------------------------------ KIRISH

  async function process(update: TgUpdate) {
    const message = update.message;
    const cb = update.callback_query;
    const chat = message?.chat ?? cb?.message?.chat;
    const from = message?.from ?? cb?.from;
    if (!chat || !from || chat.type !== "private") return;

    const users = await deps.loadUsers();
    const user = matchBotUser(users, from);
    // Ro'yxatda yo'q — umuman javob berilmaydi (tugma ham tasdiqlanmaydi).
    if (!user) return;

    // Birinchi foydalanish: hisobni bog'lash (bir marta yoziladi).
    if (user.userId === null || user.linkedAt == null) {
      try {
        await deps.bindUser(user.key, from);
      } catch (err) {
        log("hisobni bog'lab bo'lmadi", err);
      }
      user.userId = from.id;
      user.linkedAt = new Date();
    }

    if (cb) await onCallback(cb, user);
    else if (message) await onMessage(message, user);
  }

  async function handleUpdate(update: TgUpdate): Promise<void> {
    if (!update || typeof update.update_id !== "number") return;
    if (seenUpdates.has(update.update_id)) return;
    seenUpdates.add(update.update_id);
    if (seenUpdates.size > 1000) seenUpdates.delete(seenUpdates.values().next().value as number);

    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? 0;
    const previous = chatQueues.get(chatId) ?? Promise.resolve();
    const current = previous
      .then(() => process(update))
      .catch((err) => log(`yangilanish ${update.update_id} xatosi`, err));
    chatQueues.set(chatId, current);
    await current;
    if (chatQueues.get(chatId) === current) chatQueues.delete(chatId);
  }

  return {
    handleUpdate,
    async idle() {
      while (background.size > 0) await Promise.all([...background]);
    },
  };
}

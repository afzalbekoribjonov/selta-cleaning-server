import type { InlineButton, InlineKeyboard, TgMessage } from "../telegram/api";
import { mediaOf } from "./candidate";
import { MEDIA_LABEL, STATUS_ADMIN, STATUS_ICON, clip, dateTime, esc, prettyPhone } from "./format";
import { btn, deliverMedia, isUnreachable, show, showAtBottom, type HrContext } from "./screen";
import {
  addThreadEntry,
  createVacancy,
  getApplication,
  getThreadEntry,
  getVacancy,
  listApplications,
  listThread,
  listVacancies,
  notifySubscribers,
  setApplicationStatus,
  updateVacancy,
  type AppStatus,
  type Application,
  type HrUser,
  type MediaRef,
  type ThreadEntry,
} from "./store";

/**
 * Admin paneli — botning o'zida, faqat ruxsat berilgan Telegram ID'lar
 * uchun. Nomzodlar ro'yxati (holat bo'yicha), nomzod kartasi (video, rasm,
 * ovoz bir bosishda), xabar va savol yuborish (javob shu yerga keladi),
 * holatni o'zgartirish va bo'sh ish o'rinlarini boshqarish.
 */

const PAGE_SIZE = 8;

type Filter = "n" | "r" | "a" | "x" | "all";
const FILTER_STATUS: Record<Exclude<Filter, "all">, AppStatus> = { n: "new", r: "reviewing", a: "accepted", x: "rejected" };
const FILTER_LABEL: Record<Filter, string> = {
  n: "🆕 Yangi",
  r: "🕓 Ko'rib chiqilmoqda",
  a: "✅ Qabul qilingan",
  x: "❌ Rad etilgan",
  all: "📋 Hammasi",
};

const firstName = (full: string) => full.split(" ")[0] ?? full;

function cleanupMedia(ctx: HrContext, user: HrUser): Promise<unknown> {
  const ids = user.media;
  user.media = [];
  return Promise.all(ids.map((id) => ctx.api.deleteMessage(user.id, id)));
}

// --------------------------------------------------------------- BOSH MENYU

async function showHome(ctx: HrContext, user: HrUser, opts: { bottom?: boolean; banner?: string } = {}): Promise<void> {
  const [apps, vacancies] = await Promise.all([listApplications(), listVacancies(false)]);
  const count = (s: AppStatus) => apps.filter((a) => a.status === s).length;
  const active = vacancies.filter((v) => v.active).length;
  const text = [
    ...(opts.banner ? [opts.banner, ""] : []),
    "🛠 <b>Selta HR · Boshqaruv</b>",
    "",
    `🆕 Yangi: <b>${count("new")}</b>`,
    `🕓 Ko'rib chiqilmoqda: <b>${count("reviewing")}</b>`,
    `✅ Qabul qilingan: <b>${count("accepted")}</b>   ❌ Rad etilgan: <b>${count("rejected")}</b>`,
    `💼 Faol ish o'rinlari: <b>${active}</b>${vacancies.length > active ? ` / ${vacancies.length}` : ""}`,
  ].join("\n");
  const kb: InlineKeyboard = [
    [btn(count("new") > 0 ? `📥 Yangi nomzodlar (${count("new")})` : `📥 Nomzodlar (${apps.length})`, count("new") > 0 ? "a:l:n:0" : "a:l:all:0")],
    [btn("💼 Ish o'rinlari", "a:vl")],
  ];
  if (opts.bottom) await showAtBottom(ctx, user, text, kb);
  else await show(ctx, user, text, kb);
}

// ------------------------------------------------------------------- RO'YXAT

async function showList(ctx: HrContext, user: HrUser, filter: Filter, page: number, banner?: string): Promise<void> {
  const apps = await listApplications();
  const of = (f: Filter) => (f === "all" ? apps : apps.filter((a) => a.status === FILTER_STATUS[f]));
  const list = of(filter);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  user.lastList = `${filter}:${p}`;

  const tab = (f: Filter, icon: string): InlineButton => {
    const label = `${icon} ${of(f).length}`;
    return btn(f === filter ? `• ${label} •` : label, `a:l:${f}:0`);
  };
  const kb: InlineKeyboard = [[tab("n", "🆕"), tab("r", "🕓"), tab("a", "✅"), tab("x", "❌"), tab("all", "📋")]];
  for (const a of list.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE)) {
    kb.push([btn(`${STATUS_ICON[a.status]} ${clip(a.fullName, 26)} · ${clip(a.vacancyTitle, 18)}`, `a:c:${a.id}`)]);
  }
  if (pages > 1) {
    kb.push([
      btn(p > 0 ? "◀️" : "·", p > 0 ? `a:l:${filter}:${p - 1}` : "a:noop"),
      btn(`${p + 1} / ${pages}`, "a:noop"),
      btn(p < pages - 1 ? "▶️" : "·", p < pages - 1 ? `a:l:${filter}:${p + 1}` : "a:noop"),
    ]);
  }
  kb.push([btn("🏠 Bosh menyu", "a:home")]);
  const text = [
    ...(banner ? [banner, ""] : []),
    `📥 <b>Nomzodlar</b> · ${FILTER_LABEL[filter]} — ${list.length}`,
    ...(list.length === 0 ? ["", "Bu bo'limda nomzod yo'q."] : []),
  ].join("\n");
  await show(ctx, user, text, kb);
}

function backToList(user: HrUser): string {
  return `a:l:${user.lastList ?? "all:0"}`;
}

// -------------------------------------------------------------------- KARTA

function cardText(app: Application, banner?: string): string {
  const open = app.openQuestions > 0 ? ` · ❓ ${app.openQuestions} ta javobsiz` : "";
  return [
    ...(banner ? [banner, ""] : []),
    `👤 <b>${esc(app.fullName)}</b>, ${app.age} yosh`,
    `💼 ${esc(app.vacancyTitle)}`,
    `📞 ${esc(prettyPhone(app.phone))}`,
    app.username ? `💬 @${esc(app.username)}` : `💬 <a href="tg://user?id=${app.userId}">Telegram profili</a>`,
    `🗓 ${dateTime(app.createdAt)}`,
    `📌 ${STATUS_ADMIN[app.status]}`,
    ...(app.threadCount > 0 ? [`🗂 Yozishmalar: ${app.threadCount}${open}`] : []),
  ].join("\n");
}

function cardKeyboard(user: HrUser, app: Application): InlineKeyboard {
  const id = app.id;
  const kb: InlineKeyboard = [
    [btn("🎥 Video", `a:md:${id}:v`), btn("🖼 Rasm", `a:md:${id}:p`), btn("🎙 Ovoz", `a:md:${id}:o`)],
    [btn("▶️ Hammasini ko'rish", `a:md:${id}:all`)],
    [btn("✉️ Xabar", `a:msg:${id}`), btn("❓ Savol", `a:q:${id}`)],
  ];
  if (app.threadCount > 0) kb.push([btn(`🗂 Yozishmalar (${app.threadCount})`, `a:th:${id}`)]);
  if (app.status === "new" || app.status === "reviewing") {
    kb.push([btn("✅ Qabul qilish", `a:st:${id}:acc`), btn("❌ Rad etish", `a:st:${id}:rej`)]);
  } else {
    kb.push([btn("↩️ Qayta ko'rib chiqish", `a:st:${id}:rev`)]);
  }
  kb.push([btn("◀️ Ro'yxat", backToList(user))]);
  return kb;
}

async function showCard(ctx: HrContext, user: HrUser, appId: string, opts: { banner?: string; bottom?: boolean } = {}): Promise<void> {
  let app = await getApplication(appId);
  if (!app) return showList(ctx, user, "all", 0, "Nomzod topilmadi.");
  // Admin ochgan yangi ariza — "ko'rib chiqilmoqda".
  if (app.status === "new") {
    await setApplicationStatus(app.id, "reviewing", user.id);
    app = { ...app, status: "reviewing" };
  }
  if (opts.bottom) await showAtBottom(ctx, user, cardText(app, opts.banner), cardKeyboard(user, app));
  else await show(ctx, user, cardText(app, opts.banner), cardKeyboard(user, app));
}

const CAPTION_KIND: Record<"video" | "photo" | "voice", string> = { video: "🎥 Video", photo: "🖼 Rasm", voice: "🎙 Ovozli xabar" };

/** Media karta ostida emas — karta media ostiga tushadi (tugmalar doim pastda). */
async function showMedia(ctx: HrContext, user: HrUser, appId: string, which: string): Promise<void> {
  const app = await getApplication(appId);
  if (!app) return showList(ctx, user, "all", 0, "Nomzod topilmadi.");
  await cleanupMedia(ctx, user);
  const kinds: ("video" | "photo" | "voice")[] = which === "v" ? ["video"] : which === "p" ? ["photo"] : which === "o" ? ["voice"] : ["video", "photo", "voice"];
  const old = user.screenId;
  user.screenId = null;
  await ctx.api.deleteMessage(user.id, old);
  let missing = 0;
  for (const kind of kinds) {
    const id = await deliverMedia(ctx, user.id, app[kind], `${CAPTION_KIND[kind]} · <b>${esc(app.fullName)}</b>`);
    if (id) user.media.push(id);
    else missing += 1;
  }
  await showCard(ctx, user, appId, { bottom: true, banner: missing ? "⚠️ Ba'zi media topilmadi." : undefined });
}

// ----------------------------------------------------- XABAR VA SAVOL YUBORISH

async function askMessage(ctx: HrContext, user: HrUser, appId: string, kind: "message" | "question"): Promise<void> {
  const app = await getApplication(appId);
  if (!app) return showList(ctx, user, "all", 0, "Nomzod topilmadi.");
  user.await = { kind, appId };
  const text =
    kind === "question"
      ? `❓ <b>${esc(app.fullName)}</b>ga savol\n\nSavolni yozing yoki ovozli xabar yuboring — javob shu yerga keladi.`
      : `✉️ <b>${esc(app.fullName)}</b>ga xabar\n\nMatn, ovozli xabar yoki video yuboring.`;
  await show(ctx, user, text, [[btn("✖️ Bekor qilish", `a:c:${appId}`)]]);
}

async function deliverToCandidate(ctx: HrContext, app: Application, msg: TgMessage, kind: "message" | "question"): Promise<number> {
  const header = kind === "question" ? "❓ <b>Selta Cleaning · savol</b>" : "✉️ <b>Selta Cleaning</b>";
  const footer = kind === "question" ? "\n\n✍️ <i>Javobingizni kutamiz.</i>" : "";
  if (msg.text) {
    const m = await ctx.api.sendMessage(app.userId, `${header}\n\n${esc(msg.text)}${footer}`);
    return m.message_id;
  }
  await ctx.api.sendMessage(app.userId, `${header}${footer}`);
  return ctx.api.copyMessage(app.userId, msg.chat.id, msg.message_id);
}

async function sendToCandidate(ctx: HrContext, user: HrUser, msg: TgMessage, appId: string, kind: "message" | "question"): Promise<void> {
  user.await = null;
  const app = await getApplication(appId);
  await ctx.api.deleteMessage(user.id, msg.message_id);
  if (!app) return showList(ctx, user, "all", 0, "Nomzod topilmadi.");
  let candidateMessageId: number;
  try {
    candidateMessageId = await deliverToCandidate(ctx, app, msg, kind);
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    return showCard(ctx, user, appId, { banner: "⚠️ Nomzod botni to'xtatgan — xabar yetkazilmadi." });
  }
  const media = mediaOf(msg);
  await addThreadEntry(appId, {
    type: kind,
    adminId: user.id,
    text: (msg.text ?? msg.caption ?? "").trim(),
    media: media.kind === "text" ? null : media,
    questionId: null,
    candidateMessageId,
    answered: false,
  });
  await showCard(ctx, user, appId, { banner: kind === "question" ? "✅ Savol yuborildi — javobi shu yerga keladi." : "✅ Xabar yuborildi." });
}

// ------------------------------------------------------------------- HOLAT

const DECISION_TEXT: Record<"acc" | "rej", (app: Application) => string> = {
  acc: (a) =>
    `🎉 <b>Tabriklaymiz, ${esc(firstName(a.fullName))}!</b>\n\n«${esc(a.vacancyTitle)}» lavozimi bo'yicha arizangiz ma'qullandi. Tez orada siz bilan bog'lanamiz.`,
  rej: (a) =>
    `Assalomu alaykum, ${esc(firstName(a.fullName))}.\n\n«${esc(a.vacancyTitle)}» lavozimiga arizangiz uchun rahmat. Afsuski, hozircha taklif bera olmaymiz. Sizga omad tilaymiz!`,
};

async function confirmStatus(ctx: HrContext, user: HrUser, appId: string, decision: string): Promise<void> {
  const app = await getApplication(appId);
  if (!app) return showList(ctx, user, "all", 0, "Nomzod topilmadi.");
  if (decision === "rev") {
    await setApplicationStatus(appId, "reviewing", user.id);
    return showCard(ctx, user, appId, { banner: "↩️ Qayta ko'rib chiqishga qaytarildi." });
  }
  if (decision !== "acc" && decision !== "rej") return showCard(ctx, user, appId);
  const accept = decision === "acc";
  await show(ctx, user, [`${accept ? "✅" : "❌"} <b>${esc(app.fullName)}</b> ${accept ? "qabul qilinsinmi" : "rad etilsinmi"}?`, `💼 ${esc(app.vacancyTitle)}`].join("\n"), [
    [btn("📨 Ha, nomzodga xabar bilan", `a:sc:${appId}:${decision}:y`)],
    [btn("✔️ Ha, xabarsiz", `a:sc:${appId}:${decision}:n`)],
    [btn("◀️ Bekor qilish", `a:c:${appId}`)],
  ]);
}

async function applyStatus(ctx: HrContext, user: HrUser, appId: string, decision: string, notify: boolean): Promise<void> {
  const app = await getApplication(appId);
  if (!app || (decision !== "acc" && decision !== "rej")) return showCard(ctx, user, appId);
  await setApplicationStatus(appId, decision === "acc" ? "accepted" : "rejected", user.id);
  let banner = decision === "acc" ? "✅ Qabul qilindi." : "❌ Rad etildi.";
  if (notify) {
    const text = DECISION_TEXT[decision](app);
    try {
      const m = await ctx.api.sendMessage(app.userId, text);
      await addThreadEntry(appId, { type: "message", adminId: user.id, text, media: null, questionId: null, candidateMessageId: m.message_id, answered: false });
      banner += " Nomzodga xabar yuborildi.";
    } catch (err) {
      if (!isUnreachable(err)) throw err;
      banner += " ⚠️ Nomzod botni to'xtatgan — xabar yetkazilmadi.";
    }
  }
  await showCard(ctx, user, appId, { banner });
}

// ---------------------------------------------------------------- YOZISHMALAR

const ENTRY_LABEL: Record<ThreadEntry["type"], string> = {
  question: "❓ Savol",
  answer: "💬 Javob",
  message: "✉️ Xabar",
  candidate: "📨 Nomzod xabari",
};

async function showThread(ctx: HrContext, user: HrUser, appId: string, bottom = false): Promise<void> {
  const app = await getApplication(appId);
  if (!app) return showList(ctx, user, "all", 0, "Nomzod topilmadi.");
  const entries = (await listThread(appId)).slice(-12);
  const lines = [`🗂 <b>${esc(app.fullName)}</b> · yozishmalar`];
  const kb: InlineKeyboard = [];
  for (const e of entries) {
    const mediaPart = e.media ? ` · ${MEDIA_LABEL[e.media.kind]}` : "";
    const waiting = e.type === "question" && !e.answered ? " · ⏳ javob kutilmoqda" : "";
    lines.push("", `${ENTRY_LABEL[e.type]} · ${dateTime(e.at)}${mediaPart}${waiting}`);
    if (e.text) lines.push(esc(clip(e.text, 280)));
    if (e.media && kb.length < 8) {
      kb.push([btn(`▶️ ${ENTRY_LABEL[e.type]} · ${dateTime(e.at)}`, `a:tm:${appId}:${e.id}`)]);
    }
  }
  if (entries.length === 0) lines.push("", "Hali yozishma yo'q.");
  kb.push([btn("◀️ Kartaga", `a:c:${appId}`)]);
  let text = lines.join("\n");
  if (text.length > 3900) text = `${text.slice(0, 3890)}…`;
  if (bottom) await showAtBottom(ctx, user, text, kb);
  else await show(ctx, user, text, kb);
}

async function showThreadMedia(ctx: HrContext, user: HrUser, appId: string, entryId: string): Promise<void> {
  const [app, entry] = await Promise.all([getApplication(appId), getThreadEntry(appId, entryId)]);
  if (!app || !entry?.media) return showThread(ctx, user, appId);
  await cleanupMedia(ctx, user);
  const old = user.screenId;
  user.screenId = null;
  await ctx.api.deleteMessage(user.id, old);
  const id = await deliverMedia(ctx, user.id, entry.media, `${ENTRY_LABEL[entry.type]} · <b>${esc(app.fullName)}</b>`);
  if (id) user.media.push(id);
  await showThread(ctx, user, appId, true);
}

// ------------------------------------------------------------- ISH O'RINLARI

async function showVacancies(ctx: HrContext, user: HrUser, banner?: string): Promise<void> {
  const [vacancies, apps] = await Promise.all([listVacancies(false), listApplications()]);
  const kb: InlineKeyboard = vacancies.map((v) => {
    const n = apps.filter((a) => a.vacancyId === v.id).length;
    return [btn(`${v.active ? "🟢" : "⏸"} ${clip(v.title, 30)} · ${n}`, `a:v:${v.id}`)];
  });
  kb.push([btn("➕ Yangi ish o'rni", "a:vn")], [btn("🏠 Bosh menyu", "a:home")]);
  const text = [
    ...(banner ? [banner, ""] : []),
    "💼 <b>Ish o'rinlari</b>",
    ...(vacancies.length === 0 ? ["", "Hali ish o'rni qo'shilmagan — nomzodlar uchun bo'sh o'rin ko'rinmaydi."] : ["🟢 faol · ⏸ to'xtatilgan · son — arizalar"]),
  ].join("\n");
  await show(ctx, user, text, kb);
}

async function showVacancy(ctx: HrContext, user: HrUser, vacId: string, banner?: string, bottom = false): Promise<void> {
  const [vacancy, apps] = await Promise.all([getVacancy(vacId), listApplications()]);
  if (!vacancy) return showVacancies(ctx, user, "Ish o'rni topilmadi.");
  const n = apps.filter((a) => a.vacancyId === vacId).length;
  const text = [
    ...(banner ? [banner, ""] : []),
    `💼 <b>${esc(vacancy.title)}</b>`,
    `${vacancy.active ? "🟢 Faol" : "⏸ To'xtatilgan"} · 📥 ${n} ta ariza`,
    "",
    vacancy.description ? esc(vacancy.description) : "<i>Tavsif yo'q</i>",
  ].join("\n");
  const kb: InlineKeyboard = [
    [btn("✏️ Nomi", `a:ve:${vacId}:t`), btn("📝 Tavsif", `a:ve:${vacId}:d`)],
    [vacancy.active ? btn("⏸ To'xtatish", `a:vt:${vacId}`) : btn("▶️ Faollashtirish", `a:vt:${vacId}`)],
    [btn("🗑 O'chirish", `a:vd:${vacId}`)],
    [btn("◀️ Ish o'rinlari", "a:vl")],
  ];
  if (bottom) await showAtBottom(ctx, user, text, kb);
  else await show(ctx, user, text, kb);
}

/** Yangi ish o'rni ochilganda obuna bo'lganlarga xabar. */
async function announceVacancy(ctx: HrContext, vacId: string, title: string): Promise<number> {
  const ids = (await notifySubscribers()).filter((id) => !ctx.adminIds.has(id));
  let sent = 0;
  for (const id of ids) {
    try {
      await ctx.api.sendMessage(id, `🔔 <b>Yangi ish o'rni</b>\n\n💼 ${esc(title)}`, [[btn("👁 Batafsil", `c:v:${vacId}`)]]);
      sent += 1;
    } catch {
      // Botni to'xtatgan foydalanuvchi — o'tkazib yuboriladi.
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return sent;
}

async function handleAwaitedText(ctx: HrContext, user: HrUser, msg: TgMessage): Promise<boolean> {
  const wait = user.await;
  if (!wait) return false;
  if (wait.kind === "message" || wait.kind === "question") {
    await sendToCandidate(ctx, user, msg, wait.appId, wait.kind);
    return true;
  }
  const text = (msg.text ?? "").trim();
  await ctx.api.deleteMessage(user.id, msg.message_id);
  if (wait.kind === "vacTitle" || wait.kind === "editTitle") {
    if (text.length < 2 || text.length > 60) {
      await show(ctx, user, `💼 <b>Lavozim nomi</b>\n\n⚠️ Nom 2–60 belgidan iborat bo'lsin.`, [[btn("✖️ Bekor qilish", "a:x")]]);
      return true;
    }
    if (wait.kind === "editTitle") {
      await updateVacancy(wait.vacId, { title: text });
      user.await = null;
      await showVacancy(ctx, user, wait.vacId, "✅ Nomi o'zgartirildi.");
      return true;
    }
    const vacId = await createVacancy(text, user.id);
    user.await = { kind: "vacDesc", vacId, isNew: true };
    await show(ctx, user, `📝 <b>${esc(text)}</b>\n\nTavsifni yozing: vazifalar, ish vaqti, maosh.`, [
      [btn("⏭ Tavsifsiz saqlash", "a:skip")],
      [btn("✖️ Bekor qilish", "a:x")],
    ]);
    return true;
  }
  if (wait.kind === "vacDesc") {
    if (!text || text.length > 1500) {
      await show(ctx, user, "📝 <b>Tavsif</b>\n\n⚠️ Tavsifni matn bilan yozing (1500 belgigacha).", [[btn("✖️ Bekor qilish", "a:x")]]);
      return true;
    }
    await updateVacancy(wait.vacId, { description: text });
    user.await = null;
    await finishVacancy(ctx, user, wait.vacId, wait.isNew);
    return true;
  }
  return false;
}

async function finishVacancy(ctx: HrContext, user: HrUser, vacId: string, isNew: boolean): Promise<void> {
  if (!isNew) return showVacancy(ctx, user, vacId, "✅ Tavsif saqlandi.");
  const vacancy = await getVacancy(vacId);
  const sent = vacancy ? await announceVacancy(ctx, vacId, vacancy.title) : 0;
  await showVacancy(ctx, user, vacId, `✅ Ish o'rni ochildi.${sent ? ` 🔔 ${sent} kishiga xabar berildi.` : ""}`);
}

// ------------------------------------------------------- ADMINLARGA XABARNOMA

async function toAdmins(ctx: HrContext, send: (adminId: number) => Promise<unknown>): Promise<void> {
  await Promise.all(
    [...ctx.adminIds].map((id) => send(id).catch((err) => console.error(`HR bot: admin ${id} ga xabar yetmadi:`, err))),
  );
}

export async function notifyAdminsNewApplication(ctx: HrContext, appId: string): Promise<void> {
  const app = await getApplication(appId);
  if (!app) return;
  const text = [
    "🆕 <b>Yangi ariza</b>",
    "",
    `👤 ${esc(app.fullName)}, ${app.age} yosh`,
    `💼 ${esc(app.vacancyTitle)}`,
    `📞 ${esc(prettyPhone(app.phone))}`,
  ].join("\n");
  await toAdmins(ctx, (id) => ctx.api.sendMessage(id, text, [[btn("👁 Ko'rib chiqish", `a:c:${appId}`)]]));
}

/**
 * Nomzod xabari adminlarga BITTA xabar bo'lib boradi: matn bo'lsa —
 * sarlavha bilan birga, media bo'lsa — sarlavha uning izohida, tugmalar
 * ostida.
 */
async function relayToAdmins(ctx: HrContext, head: string, text: string, media: MediaRef, kb: InlineKeyboard): Promise<void> {
  await toAdmins(ctx, async (id) => {
    if (media.kind === "text") {
      await ctx.api.sendMessage(id, `${head}\n\n${esc(clip(text || "—", 3000))}`, kb);
      return;
    }
    const caption = text ? `${head}\n\n${esc(clip(text, 700))}` : head;
    const sent = await deliverMedia(ctx, id, media, caption, kb);
    if (!sent) await ctx.api.sendMessage(id, `${head}\n\n⚠️ Media topilmadi.`, kb);
  });
}

export async function notifyAdminsAnswer(ctx: HrContext, app: Application, question: ThreadEntry, text: string, media: MediaRef): Promise<void> {
  const head = `💬 <b>${esc(app.fullName)}</b> javob berdi\n❓ <i>${esc(clip(question.text || "Savol", 200))}</i>`;
  await relayToAdmins(ctx, head, text, media, [[btn("👁 Nomzod kartasi", `a:c:${app.id}`), btn("❓ Yana savol", `a:q:${app.id}`)]]);
}

export async function notifyAdminsCandidateMessage(ctx: HrContext, app: Application, text: string, media: MediaRef): Promise<void> {
  const head = `📨 <b>${esc(app.fullName)}</b> xabar yubordi\n💼 ${esc(app.vacancyTitle)}`;
  await relayToAdmins(ctx, head, text, media, [[btn("👁 Nomzod kartasi", `a:c:${app.id}`), btn("✉️ Javob yozish", `a:msg:${app.id}`)]]);
}

// ------------------------------------------------------------------- KIRISH

export async function handleAdminMessage(ctx: HrContext, user: HrUser, msg: TgMessage): Promise<void> {
  const text = (msg.text ?? "").trim();
  if (/^\/start\b/.test(text)) {
    user.await = null;
    await ctx.api.deleteMessage(user.id, msg.message_id);
    await cleanupMedia(ctx, user);
    await showHome(ctx, user, { bottom: true });
    return;
  }
  if (await handleAwaitedText(ctx, user, msg)) return;
  await ctx.api.deleteMessage(user.id, msg.message_id);
  await showHome(ctx, user, { bottom: true });
}

export async function handleAdminCallback(ctx: HrContext, user: HrUser, data: string): Promise<void> {
  const parts = data.split(":");
  const action = parts[1];
  const id = parts[2] ?? "";
  // Kutilayotgan kiritish faqat o'z ekranida — boshqa tugma bosilsa bekor.
  if (!["skip", "noop"].includes(action)) {
    const wait = user.await;
    if (wait && wait.kind === "vacDesc" && wait.isNew && action === "x") {
      await updateVacancy(wait.vacId, { deleted: true, active: false });
      user.await = null;
      return showVacancies(ctx, user, "✖️ Bekor qilindi.");
    }
    user.await = null;
  }
  if (["home", "l", "vl", "v", "vn"].includes(action)) await cleanupMedia(ctx, user);

  switch (action) {
    case "noop":
      return;
    case "home":
      return showHome(ctx, user);
    case "l":
      return showList(ctx, user, (["n", "r", "a", "x", "all"].includes(id) ? id : "all") as Filter, Number(parts[3]) || 0);
    case "c":
      return showCard(ctx, user, id);
    case "md":
      return showMedia(ctx, user, id, parts[3] ?? "all");
    case "msg":
      return askMessage(ctx, user, id, "message");
    case "q":
      return askMessage(ctx, user, id, "question");
    case "th":
      return showThread(ctx, user, id);
    case "tm":
      return showThreadMedia(ctx, user, id, parts[3] ?? "");
    case "st":
      return confirmStatus(ctx, user, id, parts[3] ?? "");
    case "sc":
      return applyStatus(ctx, user, id, parts[3] ?? "", parts[4] === "y");
    case "vl":
      return showVacancies(ctx, user);
    case "v":
      return showVacancy(ctx, user, id);
    case "vn":
      user.await = { kind: "vacTitle" };
      return show(ctx, user, "💼 <b>Yangi ish o'rni</b>\n\nLavozim nomini yozing.", [[btn("✖️ Bekor qilish", "a:x")]]);
    case "ve": {
      const vacancy = await getVacancy(id);
      if (!vacancy) return showVacancies(ctx, user, "Ish o'rni topilmadi.");
      if (parts[3] === "t") {
        user.await = { kind: "editTitle", vacId: id };
        return show(ctx, user, `✏️ <b>${esc(vacancy.title)}</b>\n\nYangi nomni yozing.`, [[btn("✖️ Bekor qilish", `a:v:${id}`)]]);
      }
      user.await = { kind: "vacDesc", vacId: id, isNew: false };
      return show(ctx, user, `📝 <b>${esc(vacancy.title)}</b>\n\nYangi tavsifni yozing: vazifalar, ish vaqti, maosh.`, [[btn("✖️ Bekor qilish", `a:v:${id}`)]]);
    }
    case "skip": {
      const wait = user.await;
      user.await = null;
      if (wait?.kind === "vacDesc") return finishVacancy(ctx, user, wait.vacId, wait.isNew);
      return showVacancies(ctx, user);
    }
    case "vt": {
      const vacancy = await getVacancy(id);
      if (!vacancy) return showVacancies(ctx, user, "Ish o'rni topilmadi.");
      await updateVacancy(id, { active: !vacancy.active });
      let banner = vacancy.active ? "⏸ To'xtatildi — nomzodlarga ko'rinmaydi." : "▶️ Faollashtirildi.";
      if (!vacancy.active) {
        const sent = await announceVacancy(ctx, id, vacancy.title);
        if (sent) banner += ` 🔔 ${sent} kishiga xabar berildi.`;
      }
      return showVacancy(ctx, user, id, banner);
    }
    case "vd": {
      const vacancy = await getVacancy(id);
      if (!vacancy) return showVacancies(ctx, user, "Ish o'rni topilmadi.");
      return show(ctx, user, `🗑 <b>«${esc(vacancy.title)}»</b> o'chirilsinmi?\n\nArizalar saqlanib qoladi.`, [
        [btn("🗑 Ha, o'chirish", `a:vdc:${id}`)],
        [btn("◀️ Bekor qilish", `a:v:${id}`)],
      ]);
    }
    case "vdc":
      await updateVacancy(id, { deleted: true, active: false });
      return showVacancies(ctx, user, "🗑 Ish o'rni o'chirildi.");
    case "x":
      return showVacancies(ctx, user, "✖️ Bekor qilindi.");
    default:
      return showHome(ctx, user);
  }
}

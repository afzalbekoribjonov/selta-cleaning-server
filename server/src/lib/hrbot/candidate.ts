import type { InlineKeyboard, TgMessage } from "../telegram/api";
import { notifyAdminsAnswer, notifyAdminsCandidateMessage, notifyAdminsNewApplication } from "./admin";
import {
  STATUS_CANDIDATE,
  cleanFullName,
  clip,
  esc,
  normalizePhone,
  parseAge,
  prettyPhone,
  shortDate,
} from "./format";
import { btn, removeReplyKeyboard, show, showAtBottom, showWithReplyKeyboard, type HrContext } from "./screen";
import {
  STEPS,
  addThreadEntry,
  applicationsOfUser,
  createApplication,
  getVacancy,
  listThread,
  listVacancies,
  type Application,
  type Draft,
  type HrUser,
  type MediaRef,
  type Step,
  type ThreadEntry,
} from "./store";

/**
 * Nomzod tomoni: lavozim tanlash → 6 qadam (ism, yosh, telefon, video,
 * rasm, ovozli xabar) → tekshirish → yuborish. Matnli javoblar (ism,
 * yosh, telefon) saqlangach chatdan o'chiriladi; media xabarlari QOLADI —
 * admin ularni `copyMessage` bilan ko'radi. Savol har doim chat oxirida.
 */

const MIN_MEDIA_SECONDS = 3;

const STEP_META: Record<Step, { icon: string; title: string; hint?: string }> = {
  name: { icon: "👤", title: "Ism va familiyangiz" },
  age: { icon: "🎂", title: "Yoshingiz" },
  phone: { icon: "📞", title: "Telefon raqamingiz" },
  video: { icon: "🎥", title: "O'zingiz haqingizda video", hint: "Videoda yuzingiz aniq ko'rinsin." },
  photo: { icon: "🖼", title: "Rasmingiz" },
  voice: { icon: "🎙", title: "Ovozli xabar", hint: "O'zingiz haqingizda qisqacha, oilaviy holatingiz va oila a'zolaringiz haqida." },
};

const PHONE_BACK = "◀️ Orqaga";
const PHONE_CANCEL = "✖️ Bekor qilish";

function progress(step: Step): string {
  const i = STEPS.indexOf(step) + 1;
  return `${"▰".repeat(i)}${"▱".repeat(STEPS.length - i)}  ${i}/${STEPS.length}`;
}

function promptText(draft: Draft, step: Step, error?: string): string {
  const meta = STEP_META[step];
  return [
    `<i>💼 ${esc(draft.vacancyTitle)}</i>`,
    progress(step),
    "",
    `${meta.icon} <b>${meta.title}</b>`,
    ...(meta.hint ? [meta.hint] : []),
    ...(error ? ["", `⚠️ ${error}`] : []),
  ].join("\n");
}

function promptKeyboard(draft: Draft, step: Step): InlineKeyboard {
  const first = STEPS.indexOf(step) === 0 && !draft.editing;
  return [[...(first ? [] : [btn("◀️ Orqaga", "c:back")]), btn("✖️ Bekor qilish", "c:cancel")]];
}

/** Qadam savolini chat oxiriga qo'yadi. */
async function askStep(ctx: HrContext, user: HrUser, step: Step, error?: string, edit = false): Promise<void> {
  const draft = user.draft!;
  const leavingPhone = user.step === "phone" && step !== "phone";
  user.step = step;
  if (leavingPhone) await removeReplyKeyboard(ctx, user.id);
  if (step === "phone") {
    await showWithReplyKeyboard(ctx, user, promptText(draft, step, error), [
      [{ text: "📱 Raqamni yuborish", request_contact: true }],
      [{ text: PHONE_BACK }, { text: PHONE_CANCEL }],
    ]);
    return;
  }
  if (edit) await show(ctx, user, promptText(draft, step, error), promptKeyboard(draft, step));
  else await showAtBottom(ctx, user, promptText(draft, step, error), promptKeyboard(draft, step));
}

// ----------------------------------------------------------------- EKRANLAR

export async function showHome(ctx: HrContext, user: HrUser, opts: { bottom?: boolean; banner?: string } = {}): Promise<void> {
  const [vacancies, apps] = await Promise.all([listVacancies(true), applicationsOfUser(user.id)]);
  if (user.step === "phone") await removeReplyKeyboard(ctx, user.id);
  // Qoralama saqlanadi — "Davom ettirish" yetishmagan qadamdan boshlaydi.
  user.step = null;

  const hello = user.firstName ? `Assalomu alaykum, ${esc(user.firstName)}! 👋` : "Assalomu alaykum! 👋";
  const lines = [...(opts.banner ? [opts.banner, ""] : []), "<b>Selta Cleaning</b> · Ishga qabul", "", hello];
  const kb: InlineKeyboard = [];
  if (user.draft) kb.push([btn(`▶️ Arizani davom ettirish · ${clip(user.draft.vacancyTitle, 24)}`, "c:resume")]);

  if (vacancies.length === 0) {
    lines.push("", "Hozircha bo'sh ish o'rinlari yo'q.");
    if (user.notify) {
      lines.push("🔔 Yangi o'rin ochilganda sizga xabar beramiz.");
      kb.push([btn("🔕 Xabarnomani o'chirish", "c:sub")]);
    } else {
      kb.push([btn("🔔 Yangi o'rin ochilsa xabar berish", "c:sub")]);
    }
  } else {
    lines.push("Qaysi lavozimga ariza topshirasiz?");
    for (const v of vacancies) kb.push([btn(`💼 ${clip(v.title, 40)}`, `c:v:${v.id}`)]);
  }
  if (apps.length > 0) kb.push([btn(`📄 Arizalarim (${apps.length})`, "c:my")]);

  if (opts.bottom) await showAtBottom(ctx, user, lines.join("\n"), kb);
  else await show(ctx, user, lines.join("\n"), kb);
}

function activeApplication(apps: Application[], vacancyId: string): Application | undefined {
  return apps.find((a) => a.vacancyId === vacancyId && a.status !== "rejected");
}

async function showVacancy(ctx: HrContext, user: HrUser, vacancyId: string): Promise<void> {
  const vacancy = await getVacancy(vacancyId);
  if (!vacancy || !vacancy.active) {
    await showHome(ctx, user, { banner: "Bu ish o'rni hozir yopiq." });
    return;
  }
  const existing = activeApplication(await applicationsOfUser(user.id), vacancyId);
  const lines = [`💼 <b>${esc(vacancy.title)}</b>`];
  if (vacancy.description) lines.push("", esc(vacancy.description));
  const kb: InlineKeyboard = [];
  if (existing?.status === "accepted") lines.push("", "✅ Siz bu lavozim bo'yicha saralashdan o'tgansiz.");
  else if (existing) lines.push("", "🕓 Bu lavozimga arizangiz ko'rib chiqilmoqda.");
  else kb.push([btn("✅ Ariza topshirish", `c:a:${vacancy.id}`)]);
  kb.push([btn("◀️ Orqaga", "c:home")]);
  await show(ctx, user, lines.join("\n"), kb);
}

async function startApplication(ctx: HrContext, user: HrUser, vacancyId: string): Promise<void> {
  const vacancy = await getVacancy(vacancyId);
  if (!vacancy || !vacancy.active) {
    await showHome(ctx, user, { banner: "Bu ish o'rni hozir yopiq." });
    return;
  }
  if (activeApplication(await applicationsOfUser(user.id), vacancyId)) {
    await showVacancy(ctx, user, vacancyId);
    return;
  }
  user.draft = {
    vacancyId: vacancy.id,
    vacancyTitle: vacancy.title,
    fullName: null,
    age: null,
    phone: null,
    video: null,
    photo: null,
    voice: null,
    editing: false,
  };
  await askStep(ctx, user, "name", undefined, true);
}

function reviewText(d: Draft): string {
  const mark = (v: unknown) => (v ? "✅" : "—");
  return [
    "📋 <b>Arizangizni tekshiring</b>",
    "",
    `💼 ${esc(d.vacancyTitle)}`,
    `👤 ${esc(d.fullName ?? "—")}`,
    `🎂 ${d.age ?? "—"} yosh`,
    `📞 ${esc(prettyPhone(d.phone ?? "—"))}`,
    `🎥 Video ${mark(d.video)}   🖼 Rasm ${mark(d.photo)}   🎙 Ovoz ${mark(d.voice)}`,
  ].join("\n");
}

async function showReview(ctx: HrContext, user: HrUser, bottom: boolean): Promise<void> {
  const leavingPhone = user.step === "phone";
  user.step = "review";
  if (user.draft) user.draft.editing = false;
  if (leavingPhone) await removeReplyKeyboard(ctx, user.id);
  const kb: InlineKeyboard = [[btn("✅ Yuborish", "c:send")], [btn("✏️ O'zgartirish", "c:edit"), btn("✖️ Bekor qilish", "c:cancel")]];
  if (bottom) await showAtBottom(ctx, user, reviewText(user.draft!), kb);
  else await show(ctx, user, reviewText(user.draft!), kb);
}

async function showEditMenu(ctx: HrContext, user: HrUser): Promise<void> {
  await show(ctx, user, "✏️ <b>Nimani o'zgartirasiz?</b>", [
    [btn("👤 Ism", "c:ef:name"), btn("🎂 Yosh", "c:ef:age"), btn("📞 Telefon", "c:ef:phone")],
    [btn("🎥 Video", "c:ef:video"), btn("🖼 Rasm", "c:ef:photo"), btn("🎙 Ovoz", "c:ef:voice")],
    [btn("◀️ Orqaga", "c:review")],
  ]);
}

async function showMyApplications(ctx: HrContext, user: HrUser): Promise<void> {
  const apps = await applicationsOfUser(user.id);
  const lines = ["📄 <b>Arizalaringiz</b>"];
  if (apps.length === 0) lines.push("", "Hali ariza topshirmagansiz.");
  for (const a of apps.slice(0, 15)) lines.push("", `💼 <b>${esc(a.vacancyTitle)}</b>`, `${STATUS_CANDIDATE[a.status]} · ${shortDate(a.createdAt)}`);
  await show(ctx, user, lines.join("\n"), [[btn("🏠 Bosh menyu", "c:home")]]);
}

/** Qoralamada hali kiritilmagan birinchi qadam. */
function firstMissing(d: Draft): Step | null {
  const filled: Record<Step, unknown> = { name: d.fullName, age: d.age, phone: d.phone, video: d.video, photo: d.photo, voice: d.voice };
  return STEPS.find((s) => !filled[s]) ?? null;
}

async function submit(ctx: HrContext, user: HrUser): Promise<void> {
  const d = user.draft;
  if (!d) return showHome(ctx, user);
  const missing = firstMissing(d);
  if (missing || !d.fullName || !d.age || !d.phone || !d.video || !d.photo || !d.voice) {
    await askStep(ctx, user, missing ?? "name", undefined, true);
    return;
  }
  const vacancy = await getVacancy(d.vacancyId);
  if (!vacancy || !vacancy.active) {
    user.draft = null;
    await showHome(ctx, user, { banner: "Afsuski, bu ish o'rni yopildi." });
    return;
  }
  if (activeApplication(await applicationsOfUser(user.id), d.vacancyId)) {
    user.draft = null;
    user.step = null;
    await showVacancy(ctx, user, d.vacancyId);
    return;
  }
  const appId = await createApplication({
    userId: user.id,
    username: user.username,
    vacancyId: vacancy.id,
    vacancyTitle: vacancy.title,
    fullName: d.fullName,
    age: d.age,
    phone: d.phone,
    video: d.video,
    photo: d.photo,
    voice: d.voice,
  });
  user.draft = null;
  user.step = null;
  await show(
    ctx,
    user,
    ["✅ <b>Arizangiz qabul qilindi</b>", "", `💼 ${esc(vacancy.title)}`, "Ko'rib chiqib, tez orada siz bilan bog'lanamiz."].join("\n"),
    [[btn("📄 Arizalarim", "c:my"), btn("🏠 Bosh menyu", "c:home")]],
  );
  await notifyAdminsNewApplication(ctx, appId);
}

// ------------------------------------------------------------ MA'LUMOT OLISH

/** Xabardagi media (yoki matn) — saqlash va keyin ko'rsatish uchun. */
export function mediaOf(msg: TgMessage): MediaRef {
  const ref = (kind: MediaRef["kind"], fileId: string | null, duration?: number): MediaRef => ({
    kind,
    chatId: msg.chat.id,
    messageId: msg.message_id,
    fileId,
    duration: duration ?? null,
  });
  if (msg.video) return ref("video", msg.video.file_id, msg.video.duration);
  if (msg.video_note) return ref("video_note", msg.video_note.file_id, msg.video_note.duration);
  if (msg.voice) return ref("voice", msg.voice.file_id, msg.voice.duration);
  if (msg.audio) return ref("audio", msg.audio.file_id, msg.audio.duration);
  if (msg.photo?.length) return ref("photo", msg.photo[msg.photo.length - 1].file_id);
  if (msg.document) {
    const mime = msg.document.mime_type ?? "";
    return ref(mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "photo" : "document", msg.document.file_id);
  }
  return ref("text", null);
}

function nextStep(step: Step): Step | null {
  const i = STEPS.indexOf(step);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

/**
 * Keyingi qadam. Matnli javob (ism, yosh) o'chirilgach savol chat oxirida
 * qoladi — o'sha xabar tahrirlanadi; media javobdan keyin esa yangi savol
 * pastga yuboriladi (media chatda qoladi).
 */
async function advance(ctx: HrContext, user: HrUser, step: Step): Promise<void> {
  const next = nextStep(step);
  const inPlace = step === "name" || step === "age";
  if (user.draft!.editing || !next) await showReview(ctx, user, !inPlace);
  else await askStep(ctx, user, next, undefined, inPlace);
}

async function handleStepInput(ctx: HrContext, user: HrUser, msg: TgMessage, step: Step): Promise<void> {
  const draft = user.draft!;
  const text = (msg.text ?? "").trim();
  const dropInput = () => ctx.api.deleteMessage(user.id, msg.message_id);

  if (step === "phone" && (text === PHONE_BACK || text === PHONE_CANCEL)) {
    await dropInput();
    if (text === PHONE_CANCEL) await cancel(ctx, user, true);
    else await goBack(ctx, user, true);
    return;
  }

  switch (step) {
    case "name": {
      const name = text ? cleanFullName(text) : null;
      await dropInput();
      if (!name) return void (await askStep(ctx, user, step, "Ism va familiyani to'liq yozing.", true));
      draft.fullName = name;
      return advance(ctx, user, step);
    }
    case "age": {
      const age = text ? parseAge(text) : null;
      await dropInput();
      if (!age) return void (await askStep(ctx, user, step, "Yoshingizni raqamda yozing.", true));
      draft.age = age;
      return advance(ctx, user, step);
    }
    case "phone": {
      const phone = msg.contact ? normalizePhone(msg.contact.phone_number.startsWith("+") ? msg.contact.phone_number : `+${msg.contact.phone_number}`) : text ? normalizePhone(text) : null;
      await dropInput();
      if (!phone) return void (await askStep(ctx, user, step, "Raqam noto'g'ri. Masalan: +998 90 123 45 67"));
      draft.phone = phone;
      return advance(ctx, user, step);
    }
    case "video": {
      const m = mediaOf(msg);
      if (m.kind !== "video" && m.kind !== "video_note") {
        await dropInput();
        return void (await askStep(ctx, user, step, "Video yuboring.", true));
      }
      if (m.duration !== null && m.duration < MIN_MEDIA_SECONDS) {
        await dropInput();
        return void (await askStep(ctx, user, step, "Video juda qisqa.", true));
      }
      draft.video = m;
      return advance(ctx, user, step);
    }
    case "photo": {
      const m = mediaOf(msg);
      if (m.kind !== "photo") {
        await dropInput();
        return void (await askStep(ctx, user, step, "Rasm yuboring.", true));
      }
      draft.photo = m;
      return advance(ctx, user, step);
    }
    case "voice": {
      const m = mediaOf(msg);
      if (m.kind !== "voice" && m.kind !== "audio") {
        await dropInput();
        return void (await askStep(ctx, user, step, "Ovozli xabar yuboring.", true));
      }
      if (m.duration !== null && m.duration < MIN_MEDIA_SECONDS) {
        await dropInput();
        return void (await askStep(ctx, user, step, "Ovozli xabar juda qisqa.", true));
      }
      draft.voice = m;
      return advance(ctx, user, step);
    }
  }
}

async function goBack(ctx: HrContext, user: HrUser, bottom = false): Promise<void> {
  const draft = user.draft;
  const step = user.step;
  if (!draft || !step || step === "review") return showHome(ctx, user);
  if (draft.editing) return showReview(ctx, user, bottom || step === "phone");
  const i = STEPS.indexOf(step);
  if (i <= 0) return showHome(ctx, user);
  await askStep(ctx, user, STEPS[i - 1], undefined, !bottom && step !== "phone");
}

async function cancel(ctx: HrContext, user: HrUser, bottom = false): Promise<void> {
  if (user.step === "phone") await removeReplyKeyboard(ctx, user.id);
  user.draft = null;
  user.step = null;
  await showHome(ctx, user, { bottom, banner: "✖️ Ariza bekor qilindi." });
}

// ------------------------------------------------------- SAVOLLARGA JAVOB

/** Javob kutilayotgan savol: "reply" qilingani, bo'lmasa eng oxirgisi. */
async function findOpenQuestion(userId: number, replyTo: number | null): Promise<{ app: Application; question: ThreadEntry } | null> {
  const apps = (await applicationsOfUser(userId)).filter((a) => a.openQuestions > 0);
  let latest: { app: Application; question: ThreadEntry } | null = null;
  for (const app of apps) {
    const open = (await listThread(app.id)).filter((e) => e.type === "question" && !e.answered);
    for (const q of open) {
      if (replyTo && q.candidateMessageId === replyTo) return { app, question: q };
      if (!latest || q.at > latest.question.at) latest = { app, question: q };
    }
  }
  return latest;
}

async function handleIdleMessage(ctx: HrContext, user: HrUser, msg: TgMessage): Promise<void> {
  const open = await findOpenQuestion(user.id, msg.reply_to_message?.message_id ?? null);
  const media = mediaOf(msg);
  const text = (msg.text ?? msg.caption ?? "").trim();
  if (open) {
    await addThreadEntry(open.app.id, {
      type: "answer",
      adminId: null,
      text,
      media: media.kind === "text" ? null : media,
      questionId: open.question.id,
      candidateMessageId: msg.message_id,
      answered: false,
    });
    await ctx.api.sendMessage(user.id, "✅ Javobingiz yuborildi.");
    await notifyAdminsAnswer(ctx, open.app, open.question, text, media);
    return;
  }
  const apps = await applicationsOfUser(user.id);
  const latest = apps[0];
  if (latest && (text || media.kind !== "text")) {
    await addThreadEntry(latest.id, {
      type: "candidate",
      adminId: null,
      text,
      media: media.kind === "text" ? null : media,
      questionId: null,
      candidateMessageId: msg.message_id,
      answered: false,
    });
    await ctx.api.sendMessage(user.id, "✅ Xabaringiz yetkazildi.");
    await notifyAdminsCandidateMessage(ctx, latest, text, media);
    return;
  }
  await ctx.api.deleteMessage(user.id, msg.message_id);
  await showHome(ctx, user, { bottom: true });
}

// ------------------------------------------------------------------ KIRISH

export async function handleCandidateMessage(ctx: HrContext, user: HrUser, msg: TgMessage): Promise<void> {
  const text = (msg.text ?? "").trim();
  if (/^\/start\b/.test(text)) {
    await ctx.api.deleteMessage(user.id, msg.message_id);
    await showHome(ctx, user, { bottom: true });
    return;
  }
  if (user.step && user.step !== "review" && user.draft) {
    await handleStepInput(ctx, user, msg, user.step);
    return;
  }
  if (user.step === "review" && user.draft) {
    // Tekshirish ekranida ortiqcha xabar — chat toza qolsin, ekran pastga tushadi.
    if (msg.text) await ctx.api.deleteMessage(user.id, msg.message_id);
    await showReview(ctx, user, true);
    return;
  }
  await handleIdleMessage(ctx, user, msg);
}

export async function handleCandidateCallback(ctx: HrContext, user: HrUser, data: string): Promise<void> {
  const [, action, arg] = data.split(":");
  switch (action) {
    case "home":
      return showHome(ctx, user);
    case "v":
      return showVacancy(ctx, user, arg ?? "");
    case "a":
      return startApplication(ctx, user, arg ?? "");
    case "resume":
      if (user.draft && user.step && user.step !== "review") return askStep(ctx, user, user.step, undefined, true);
      if (user.draft) {
        const missing = firstMissing(user.draft);
        return missing ? askStep(ctx, user, missing, undefined, true) : showReview(ctx, user, false);
      }
      return showHome(ctx, user);
    case "back":
      return goBack(ctx, user);
    case "cancel":
      return cancel(ctx, user);
    case "review":
      return user.draft ? showReview(ctx, user, false) : showHome(ctx, user);
    case "edit":
      return user.draft ? showEditMenu(ctx, user) : showHome(ctx, user);
    case "ef":
      if (user.draft && (STEPS as string[]).includes(arg ?? "")) {
        user.draft.editing = true;
        return askStep(ctx, user, arg as Step, undefined, arg !== "phone");
      }
      return showHome(ctx, user);
    case "send":
      return submit(ctx, user);
    case "my":
      return showMyApplications(ctx, user);
    case "sub":
      user.notify = !user.notify;
      return showHome(ctx, user);
    default:
      return showHome(ctx, user);
  }
}
